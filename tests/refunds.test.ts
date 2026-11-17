import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { holdReservation } from "../lib/domain/reservations";
import { beginPayment, settlePayment } from "../lib/domain/payments";
import { recordDeskPayment } from "../lib/domain/desk-payment";
import { cancelBookingRecord } from "../lib/domain/cancel";
import { recordManualRefund, refundOnline, syncPendingRefunds } from "../lib/domain/refunds";
import { bookConfirmed, setupSeededDb } from "./helpers/tickets";
import { FakeGateway } from "./helpers/fake-gateway";

const ctx = setupSeededDb();

async function paidOnline(gw: FakeGateway) {
  const held = await holdReservation(ctx.db, {
    productKey: "meeting-4", date: "2026-12-01", start: 9, duration: 2,
    customerName: "Paying Guest", customerEmail: "pay@example.com",
  });
  if (!held.ok) throw new Error(held.error);
  const begun = await beginPayment(ctx.db, gw, {
    bookingId: held.bookingId, phone: "9876543210", returnUrl: "https://x.test/r",
  });
  if (!begun.ok) throw new Error(begun.error);
  gw.setStatus(begun.orderId, "PAID");
  const settled = await settlePayment(ctx.db, gw, { orderId: begun.orderId });
  if (!settled.ok || settled.status !== "paid") throw new Error("not paid");
  const [p] = await ctx.db.select().from(schema.payment).where(eq(schema.payment.orderId, begun.orderId));
  return { bookingId: held.bookingId, payment: p };
}

const paymentById = async (id: string) =>
  (await ctx.db.select().from(schema.payment).where(eq(schema.payment.id, id)))[0];

describe("cancelBookingRecord", () => {
  test("releases seats, stamps the canceller and leaves an unpaid booking owing nothing", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    const res = await cancelBookingRecord(ctx.db, { bookingId, by: "member" });
    expect(res).toEqual({ ok: true, refund: null });
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
    expect(b.status).toBe("cancelled");
    expect(b.cancelledBy).toBe("member");
    expect(b.cancelledAt).not.toBeNull();
    const rows = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.bookingId, bookingId));
    expect(rows.every((r) => r.status === "cancelled")).toBe(true);
    expect(await cancelBookingRecord(ctx.db, { bookingId, by: "member" })).toEqual({
      ok: false,
      error: "already_cancelled",
    });
  });

  test("a paid booking keeps its paid status and owes a full refund", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    await recordDeskPayment(ctx.db, { bookingId, method: "cash", recordedBy: "s" });
    const res = await cancelBookingRecord(ctx.db, { bookingId, by: "staff@collabix.co.in" });
    expect(res.ok && res.refund).toMatchObject({ provider: "desk", amountMinor: 82600 });
    const [p] = await ctx.db.select().from(schema.payment).where(eq(schema.payment.bookingId, bookingId));
    expect(p).toMatchObject({ status: "paid", refundStatus: "due", refundAmountMinor: 82600 });
  });
});

describe("refunds", () => {
  test("an online payment is refunded through the gateway once", async () => {
    const gw = new FakeGateway();
    const { bookingId, payment } = await paidOnline(gw);
    await cancelBookingRecord(ctx.db, { bookingId, by: "member" });

    const res = await refundOnline(ctx.db, gw, { paymentId: payment.id, by: "owner@x" });
    expect(res).toEqual({ ok: true, status: "refunded", amountMinor: payment.amountMinor });
    expect(gw.refunds.size).toBe(1);
    expect([...gw.refunds.values()][0].amountRupees).toBe(payment.amountMinor / 100);
    expect(await paymentById(payment.id)).toMatchObject({ status: "paid", refundStatus: "refunded" });

    expect(await refundOnline(ctx.db, gw, { paymentId: payment.id, by: "owner@x" })).toEqual({
      ok: false,
      error: "nothing_owed",
    });
    expect(gw.refunds.size).toBe(1);
  });

  test("a pending refund settles on sync; a gateway error can be retried", async () => {
    const gw = new FakeGateway();
    const { bookingId, payment } = await paidOnline(gw);
    await cancelBookingRecord(ctx.db, { bookingId, by: "member" });

    gw.nextRefundStatus = "THROW";
    expect(await refundOnline(ctx.db, gw, { paymentId: payment.id, by: "s" })).toEqual({
      ok: false,
      error: "gateway_error",
    });
    expect((await paymentById(payment.id)).refundStatus).toBe("failed");

    gw.nextRefundStatus = "PENDING";
    expect(await refundOnline(ctx.db, gw, { paymentId: payment.id, by: "s" })).toMatchObject({
      ok: true,
      status: "pending",
    });
    gw.refunds.forEach((r) => (r.status = "SUCCESS"));
    expect(await syncPendingRefunds(ctx.db, gw)).toBe(1);
    const p = await paymentById(payment.id);
    expect(p.refundStatus).toBe("refunded");
    expect(p.refundedAt).not.toBeNull();
  });

  test("an uncancelled paid booking owes nothing", async () => {
    const gw = new FakeGateway();
    const { payment } = await paidOnline(gw);
    expect(await refundOnline(ctx.db, gw, { paymentId: payment.id, by: "s" })).toEqual({
      ok: false,
      error: "nothing_owed",
    });
  });

  test("a desk payment is refunded by hand, not through the gateway", async () => {
    const gw = new FakeGateway();
    const { bookingId } = await bookConfirmed(ctx.db);
    await recordDeskPayment(ctx.db, { bookingId, method: "cash", recordedBy: "s" });
    await cancelBookingRecord(ctx.db, { bookingId, by: "member" });
    const [p] = await ctx.db.select().from(schema.payment).where(eq(schema.payment.bookingId, bookingId));
    expect(await refundOnline(ctx.db, gw, { paymentId: p.id, by: "s" })).toEqual({ ok: false, error: "not_online" });
    expect(await recordManualRefund(ctx.db, { paymentId: p.id, reference: "cash at desk" })).toEqual({
      ok: true,
      status: "refunded",
      amountMinor: 82600,
    });
    expect(await paymentById(p.id)).toMatchObject({ refundStatus: "refunded", refundReference: "cash at desk" });
  });
});
