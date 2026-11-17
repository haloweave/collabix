// Cancelling a booking: release every held/confirmed seat, stamp who cancelled
// it, and flag any payment taken for it as owing a refund. The refund itself is
// a separate, deliberate step (lib/domain/refunds.ts) so staff stay in control
// of the cancellation policy.

import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Db } from "./reservations";
import { refundToWallet } from "./wallet";

export type CancelResult =
  | {
      ok: true;
      /** The payment now owing a refund, if the booking was paid. `settled`:
       * already refunded (a wallet payment goes straight back to the wallet). */
      refund: { paymentId: string; provider: string; amountMinor: number; settled: boolean } | null;
    }
  | { ok: false; error: "not_found" | "already_cancelled" };

export async function cancelBookingRecord(
  db: Db,
  input: { bookingId: string; by: string; now?: Date },
): Promise<CancelResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [b] = await tx
      .select({ status: schema.booking.status })
      .from(schema.booking)
      .where(eq(schema.booking.id, input.bookingId))
      .for("update");
    if (!b) return { ok: false, error: "not_found" };
    if (b.status === "cancelled") return { ok: false, error: "already_cancelled" };

    // status='cancelled' drops out of the no-overlap exclusion constraint,
    // freeing the seats. Expired reservations are left as they are.
    await tx
      .update(schema.reservation)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.reservation.bookingId, input.bookingId),
          inArray(schema.reservation.status, ["held", "confirmed"]),
        ),
      );
    await tx
      .update(schema.booking)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: input.by })
      .where(eq(schema.booking.id, input.bookingId));

    const [paid] = await tx
      .update(schema.payment)
      .set({ refundStatus: "due", refundAmountMinor: schema.payment.amountMinor, updatedAt: now })
      .where(
        and(
          eq(schema.payment.bookingId, input.bookingId),
          eq(schema.payment.status, "paid"),
          isNull(schema.payment.refundStatus),
        ),
      )
      .returning({
        id: schema.payment.id,
        provider: schema.payment.provider,
        amountMinor: schema.payment.amountMinor,
        memberId: schema.payment.memberId,
      });
    if (!paid) return { ok: true, refund: null };

    // Wallet money goes straight back to the wallet: nothing for staff to do.
    let settled = false;
    if (paid.provider === "wallet" && paid.memberId) {
      await refundToWallet(tx, {
        bookingId: input.bookingId,
        userId: paid.memberId,
        amountMinor: paid.amountMinor,
        by: input.by,
      });
      await tx
        .update(schema.payment)
        .set({ refundStatus: "refunded", refundReference: "wallet", refundedAt: now })
        .where(eq(schema.payment.id, paid.id));
      settled = true;
    }
    return {
      ok: true,
      refund: { paymentId: paid.id, provider: paid.provider, amountMinor: paid.amountMinor, settled },
    };
  });
}
