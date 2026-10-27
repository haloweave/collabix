// Payments taken at the front desk (cash, UPI to the counter QR, card machine,
// bank transfer). Recorded as a `payment` row with provider 'desk' so every
// "is it paid?" check — account page, invoice, admin — treats it like an online
// payment. One desk payment per booking; it can be removed if entered by mistake.

import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Db } from "./reservations";

export const DESK_METHODS = ["cash", "upi", "card", "bank_transfer"] as const;
export type DeskMethod = (typeof DESK_METHODS)[number];

export const deskOrderId = (bookingId: string) => `desk_${bookingId}`;

export type DeskPaymentResult =
  | { ok: true; amountMinor: number }
  | { ok: false; error: "not_found" | "not_confirmed" | "already_paid" | "no_amount" | "bad_method" };

export async function recordDeskPayment(
  db: Db,
  input: { bookingId: string; method: string; reference?: string; recordedBy: string; now?: Date },
): Promise<DeskPaymentResult> {
  if (!(DESK_METHODS as readonly string[]).includes(input.method)) return { ok: false, error: "bad_method" };
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    // Lock the booking so two clicks can't both record a payment.
    const [booking] = await tx
      .select()
      .from(schema.booking)
      .where(eq(schema.booking.id, input.bookingId))
      .for("update");
    if (!booking || booking.status !== "active") return { ok: false, error: "not_found" };

    const rows = await tx
      .select()
      .from(schema.reservation)
      .where(eq(schema.reservation.bookingId, input.bookingId));
    if (!rows.some((r) => r.status === "confirmed")) return { ok: false, error: "not_confirmed" };

    const [paid] = await tx
      .select({ id: schema.payment.id })
      .from(schema.payment)
      .where(and(eq(schema.payment.bookingId, input.bookingId), eq(schema.payment.status, "paid")))
      .limit(1);
    if (paid) return { ok: false, error: "already_paid" };

    const amountMinor = Number((rows[0].quoteSnapshot as { totalMinor?: number }).totalMinor ?? 0);
    if (!amountMinor) return { ok: false, error: "no_amount" };

    const reference = input.reference?.trim().slice(0, 80) || null;
    await tx.insert(schema.payment).values({
      bookingId: input.bookingId,
      memberId: booking.memberId,
      provider: "desk",
      orderId: deskOrderId(input.bookingId),
      amountMinor,
      status: "paid",
      paymentMethod: input.method,
      paidAt: now,
      raw: { reference, recordedBy: input.recordedBy },
    });
    return { ok: true, amountMinor };
  });
}

/** Undo a desk payment entered by mistake. Online payments are never touched. */
export async function removeDeskPayment(db: Db, bookingId: string): Promise<boolean> {
  const removed = await db
    .delete(schema.payment)
    .where(and(eq(schema.payment.orderId, deskOrderId(bookingId)), eq(schema.payment.provider, "desk")))
    .returning({ id: schema.payment.id });
  return removed.length > 0;
}
