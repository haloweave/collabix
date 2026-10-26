// Online payment for a public booking (Cashfree). beginPayment creates one
// gateway order per attempt and stretches the hold to cover the payment
// window; settlePayment asks the gateway whether the order is PAID and only
// then confirms the booking and issues its ticket. Settlement is idempotent —
// the browser's return, the webhook and the return page may all call it.

import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import type { CashfreeGateway, CashfreeMode } from "../payments/cashfree";
import { newCustomerId, newOrderId, toCashfreePhone, toOrderAmount } from "../payments/cashfree";
import { confirmBooking, type Db, type Tx } from "./reservations";
import type { Quote } from "./booking";

/**
 * Minutes a guest gets to finish paying once they reach the Pay step. The hold
 * and the Cashfree order expire together; Cashfree insists the order lives for
 * more than 15 minutes, hence 20.
 */
export const PAYMENT_WINDOW_MIN = 20;

export type BeginPaymentInput = {
  bookingId: string;
  memberId?: string;
  /** E.164 or 10-digit Indian number, as verified by OTP. */
  phone: string;
  returnUrl: string;
  notifyUrl?: string;
  now?: Date;
};

export type BeginPaymentResult =
  | { ok: true; orderId: string; paymentSessionId: string; amountMinor: number; mode: CashfreeMode }
  | { ok: false; error: "not_found" | "already_confirmed" | "hold_expired" | "no_amount" };

export type SettleResult =
  | { ok: true; status: "paid"; bookingId: string; ticketToken: string; newlyConfirmed: boolean }
  | { ok: true; status: "pending" | "failed" | "expired" | "refund_due"; bookingId: string }
  | { ok: false; error: "not_found" | "payment_required" };

export async function beginPayment(
  db: Db,
  gw: CashfreeGateway,
  input: BeginPaymentInput,
): Promise<BeginPaymentResult> {
  const now = input.now ?? new Date();
  const [booking] = await db
    .select()
    .from(schema.booking)
    .where(eq(schema.booking.id, input.bookingId));
  if (!booking || booking.status !== "active") return { ok: false, error: "not_found" };

  const rows = await db
    .select()
    .from(schema.reservation)
    .where(eq(schema.reservation.bookingId, input.bookingId));
  if (rows.length === 0) return { ok: false, error: "not_found" };
  if (rows.some((r) => r.status === "confirmed")) return { ok: false, error: "already_confirmed" };
  const held = rows.filter((r) => r.status === "held");
  if (held.length === 0) return { ok: false, error: "hold_expired" };

  const amountMinor = (held[0].quoteSnapshot as Quote | null)?.totalMinor ?? 0;
  if (amountMinor < 100) return { ok: false, error: "no_amount" };

  // An attempt still open with the gateway is reused rather than duplicated.
  const existing = await db
    .select()
    .from(schema.payment)
    .where(eq(schema.payment.bookingId, input.bookingId))
    .orderBy(desc(schema.payment.createdAt));
  const open = existing.find(
    (p) => p.status === "created" && p.paymentSessionId && p.expiresAt && p.expiresAt > now,
  );
  if (open) {
    return {
      ok: true,
      orderId: open.orderId,
      paymentSessionId: open.paymentSessionId!,
      amountMinor: open.amountMinor,
      mode: gw.mode,
    };
  }

  const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MIN * 60_000);
  await db
    .update(schema.reservation)
    .set({ holdExpiresAt: expiresAt })
    .where(
      and(
        eq(schema.reservation.bookingId, input.bookingId),
        eq(schema.reservation.status, "held"),
      ),
    );

  const orderId = newOrderId();
  const order = await gw.createOrder({
    orderId,
    amountRupees: toOrderAmount(amountMinor),
    customerId: newCustomerId(),
    customerPhone: toCashfreePhone(input.phone),
    customerEmail: booking.customerEmail,
    customerName: booking.customerName,
    returnUrl: input.returnUrl,
    notifyUrl: input.notifyUrl,
    expiresAt,
    note: `Collabix booking ${held.length} seat${held.length === 1 ? "" : "s"}`,
  });
  if (!order.paymentSessionId) throw new Error("cashfree: order created without a payment session");

  await db.insert(schema.payment).values({
    bookingId: input.bookingId,
    memberId: input.memberId ?? null,
    orderId,
    cfOrderId: order.cfOrderId,
    paymentSessionId: order.paymentSessionId,
    amountMinor,
    status: "created",
    expiresAt,
  });

  return { ok: true, orderId, paymentSessionId: order.paymentSessionId, amountMinor, mode: gw.mode };
}

const TERMINAL_UNPAID = new Set(["EXPIRED", "TERMINATED", "TERMINATION_REQUESTED"]);

export async function settlePayment(
  db: Db,
  gw: CashfreeGateway,
  input: { orderId: string; now?: Date },
): Promise<SettleResult> {
  const now = input.now ?? new Date();
  const [payment] = await db
    .select()
    .from(schema.payment)
    .where(eq(schema.payment.orderId, input.orderId));
  if (!payment) return { ok: false, error: "not_found" };

  if (payment.status === "paid") {
    // Already settled: re-run confirm for its (idempotent) ticket token.
    const c = await confirmBooking(db, { bookingId: payment.bookingId, allowLapsedHold: true });
    if (!c.ok) return { ok: true, status: "refund_due", bookingId: payment.bookingId };
    return { ok: true, status: "paid", bookingId: payment.bookingId, ticketToken: c.ticketToken, newlyConfirmed: false };
  }
  if (payment.status === "refund_due") {
    return { ok: true, status: "refund_due", bookingId: payment.bookingId };
  }

  const order = await gw.fetchOrder(input.orderId);
  if (order.orderStatus !== "PAID") {
    if (TERMINAL_UNPAID.has(order.orderStatus)) {
      await setStatus(db, payment.id, "expired", now);
      return { ok: true, status: "expired", bookingId: payment.bookingId };
    }
    return { ok: true, status: payment.status === "failed" ? "failed" : "pending", bookingId: payment.bookingId };
  }

  const success = (await gw.fetchPayments(input.orderId)).find((p) => p.status === "SUCCESS");

  return db.transaction(async (tx) => {
    // Money arrived. It is ours to keep only if *this* order is what confirms
    // (or already confirmed) an active booking; anything else is a refund.
    const [booking] = await tx
      .select({ status: schema.booking.status })
      .from(schema.booking)
      .where(eq(schema.booking.id, payment.bookingId));
    const refund = async () => {
      await setStatus(tx, payment.id, "refund_due", now, success);
      return { ok: true as const, status: "refund_due" as const, bookingId: payment.bookingId };
    };
    if (!booking || booking.status !== "active") return refund();

    const confirmed = await confirmBooking(tx, {
      bookingId: payment.bookingId,
      memberId: payment.memberId ?? undefined,
      allowLapsedHold: true,
    });
    if (!confirmed.ok) return refund();
    if (!confirmed.newlyConfirmed) {
      // Already confirmed by an earlier order: this one is a double charge.
      const [other] = await tx
        .select({ id: schema.payment.id })
        .from(schema.payment)
        .where(
          and(
            eq(schema.payment.bookingId, payment.bookingId),
            eq(schema.payment.status, "paid"),
          ),
        )
        .limit(1);
      if (other && other.id !== payment.id) return refund();
    }
    await setStatus(tx, payment.id, "paid", now, success);
    return {
      ok: true,
      status: "paid",
      bookingId: payment.bookingId,
      ticketToken: confirmed.ticketToken,
      newlyConfirmed: confirmed.newlyConfirmed,
    };
  });
}

/** Settle the booking's most recent attempt (the confirm route's entry point). */
export async function settleLatestForBooking(
  db: Db,
  gw: CashfreeGateway,
  bookingId: string,
): Promise<SettleResult> {
  const [latest] = await db
    .select({ orderId: schema.payment.orderId })
    .from(schema.payment)
    .where(eq(schema.payment.bookingId, bookingId))
    .orderBy(desc(schema.payment.createdAt))
    .limit(1);
  if (!latest) return { ok: false, error: "payment_required" };
  return settlePayment(db, gw, { orderId: latest.orderId });
}

/** Webhook: a failed attempt on an order that is still open. */
export async function markPaymentFailed(db: Db, orderId: string): Promise<void> {
  await db
    .update(schema.payment)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(schema.payment.orderId, orderId), inArray(schema.payment.status, ["created"])));
}

async function setStatus(
  db: Db | Tx,
  id: string,
  status: "paid" | "expired" | "refund_due",
  now: Date,
  success?: { cfPaymentId: string | null; method: string | null; raw: unknown },
) {
  await db
    .update(schema.payment)
    .set({
      status,
      updatedAt: now,
      ...(status === "paid" ? { paidAt: now } : {}),
      ...(success
        ? { cfPaymentId: success.cfPaymentId, paymentMethod: success.method, raw: success.raw }
        : {}),
    })
    .where(eq(schema.payment.id, id));
}
