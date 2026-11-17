// Refunds. A payment owes a refund when its booking was cancelled
// (refund_status 'due', set by lib/domain/cancel.ts) or when Cashfree took the
// money but the seat was lost (status 'refund_due'). Online payments are
// refunded through Cashfree; desk payments are handed back in person and only
// recorded here.
//
// Lifecycle of refund_status: due → pending → refunded, or → failed (retry).

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import * as schema from "../db/schema";
import { toOrderAmount, type CashfreeGateway } from "../payments/cashfree";
import type { Db } from "./reservations";

type PaymentRow = typeof schema.payment.$inferSelect;

/** True when this payment still owes the customer money back. */
export function owesRefund(p: Pick<PaymentRow, "status" | "refundStatus">): boolean {
  if (p.status === "paid") return p.refundStatus === "due" || p.refundStatus === "failed";
  if (p.status === "refund_due") return p.refundStatus == null || p.refundStatus === "due" || p.refundStatus === "failed";
  return false;
}

/** Our refund id for a payment: alphanumeric, stable, so a retry is idempotent at Cashfree. */
export const refundIdFor = (paymentId: string) => `rf${paymentId.replace(/-/g, "")}`;

/** Map Cashfree's refund_status to ours. */
export function refundStatusFrom(gatewayStatus: string): "refunded" | "pending" | "failed" {
  if (gatewayStatus === "SUCCESS") return "refunded";
  if (gatewayStatus === "CANCELLED" || gatewayStatus === "FAILED") return "failed";
  return "pending";
}

export type RefundResult =
  | { ok: true; status: "refunded" | "pending"; amountMinor: number }
  | { ok: false; error: "not_found" | "nothing_owed" | "not_online" | "gateway_error" | "gateway_failed" };

/** Refund an online (Cashfree) payment in full. */
export async function refundOnline(
  db: Db,
  gw: CashfreeGateway,
  input: { paymentId: string; by: string; now?: Date },
): Promise<RefundResult> {
  const now = input.now ?? new Date();
  const [p] = await db.select().from(schema.payment).where(eq(schema.payment.id, input.paymentId));
  if (!p) return { ok: false, error: "not_found" };
  if (p.provider !== "cashfree") return { ok: false, error: "not_online" };
  if (!owesRefund(p)) return { ok: false, error: "nothing_owed" };

  // Claim it: two staff clicking at once must not both reach the gateway
  // (the refund id would de-duplicate anyway, but the claim keeps state tidy).
  const amountMinor = p.refundAmountMinor ?? p.amountMinor;
  const refundId = refundIdFor(p.id);
  const claimed = await db
    .update(schema.payment)
    .set({ refundStatus: "pending", refundAmountMinor: amountMinor, refundId, updatedAt: now })
    .where(
      and(
        eq(schema.payment.id, p.id),
        or(isNull(schema.payment.refundStatus), inArray(schema.payment.refundStatus, ["due", "failed"])),
      ),
    )
    .returning({ id: schema.payment.id });
  if (claimed.length === 0) return { ok: false, error: "nothing_owed" };

  let status: "refunded" | "pending" | "failed";
  let reference: string | null = null;
  try {
    const r = await gw.createRefund({
      orderId: p.orderId,
      refundId,
      amountRupees: toOrderAmount(amountMinor),
      note: `Collabix refund by ${input.by}`.slice(0, 100),
    });
    status = refundStatusFrom(r.status);
    reference = r.cfRefundId;
  } catch (e) {
    console.error("[refund] cashfree refund failed", e);
    await setRefund(db, p.id, { refundStatus: "failed" }, now);
    return { ok: false, error: "gateway_error" };
  }

  await setRefund(
    db,
    p.id,
    { refundStatus: status, refundReference: reference, ...(status === "refunded" ? { refundedAt: now } : {}) },
    now,
  );
  if (status === "failed") return { ok: false, error: "gateway_failed" };
  return { ok: true, status, amountMinor };
}

/** Record a refund handed back outside the gateway (cash, UPI or bank transfer from the desk). */
export async function recordManualRefund(
  db: Db,
  input: { paymentId: string; reference?: string; now?: Date },
): Promise<RefundResult> {
  const now = input.now ?? new Date();
  const [p] = await db.select().from(schema.payment).where(eq(schema.payment.id, input.paymentId));
  if (!p) return { ok: false, error: "not_found" };
  if (!owesRefund(p)) return { ok: false, error: "nothing_owed" };
  const amountMinor = p.refundAmountMinor ?? p.amountMinor;
  await setRefund(
    db,
    p.id,
    {
      refundStatus: "refunded",
      refundAmountMinor: amountMinor,
      refundReference: input.reference?.trim().slice(0, 80) || "manual",
      refundedAt: now,
    },
    now,
  );
  return { ok: true, status: "refunded", amountMinor };
}

/** Ask Cashfree about every refund still processing; returns how many settled. */
export async function syncPendingRefunds(db: Db, gw: CashfreeGateway, now = new Date()): Promise<number> {
  const pending = await db
    .select()
    .from(schema.payment)
    .where(and(eq(schema.payment.refundStatus, "pending"), eq(schema.payment.provider, "cashfree")));
  let settled = 0;
  for (const p of pending) {
    if (!p.refundId) continue;
    try {
      const r = await gw.fetchRefund(p.orderId, p.refundId);
      const status = refundStatusFrom(r.status);
      if (status === "pending") continue;
      await setRefund(
        db,
        p.id,
        { refundStatus: status, refundReference: r.cfRefundId, ...(status === "refunded" ? { refundedAt: now } : {}) },
        now,
      );
      settled++;
    } catch (e) {
      console.error("[refund] could not check refund", p.refundId, e);
    }
  }
  return settled;
}

async function setRefund(
  db: Db,
  id: string,
  set: Partial<Pick<PaymentRow, "refundStatus" | "refundAmountMinor" | "refundReference" | "refundedAt">>,
  now: Date,
) {
  await db.update(schema.payment).set({ ...set, updatedAt: now }).where(eq(schema.payment.id, id));
}
