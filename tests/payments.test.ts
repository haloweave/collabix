import { describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { holdReservation, sweepExpiredHolds } from "../lib/domain/reservations";
import { beginPayment, PAYMENT_WINDOW_MIN, settlePayment } from "../lib/domain/payments";
import { setupSeededDb } from "./helpers/tickets";
import { FakeGateway } from "./helpers/fake-gateway";

const ctx = setupSeededDb();
const slot = { date: "2026-12-01", start: 9, duration: 2 };
const guest = { customerName: "Test Guest", customerEmail: "guest@example.com" };
const begin = (gw: FakeGateway, bookingId: string, extra: Partial<Parameters<typeof beginPayment>[2]> = {}) =>
  beginPayment(ctx.db, gw, { bookingId, phone: "+919876543210", returnUrl: "https://x.test/r?order_id={order_id}", ...extra });

async function holdOne() {
  const held = await holdReservation(ctx.db, { productKey: "meeting-4", ...slot, ...guest });
  if (!held.ok) throw new Error(held.error);
  return held;
}

async function reservations(bookingId: string) {
  return ctx.db.select().from(schema.reservation).where(eq(schema.reservation.bookingId, bookingId));
}
async function payments(bookingId: string) {
  return ctx.db.select().from(schema.payment).where(eq(schema.payment.bookingId, bookingId));
}

describe("beginPayment", () => {
  test("creates one order for the quoted total and extends the hold", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const before = Date.now();
    const r = await begin(gw, held.bookingId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amountMinor).toBe(held.quote.totalMinor);
    expect(r.paymentSessionId).toBe(`sess_${r.orderId}`);
    expect(r.mode).toBe("sandbox");
    const order = gw.orders.get(r.orderId)!;
    expect(order.input.amountRupees).toBe(held.quote.totalMinor / 100);
    expect(order.input.customerPhone).toBe("9876543210");
    const [res] = await reservations(held.bookingId);
    expect(res.holdExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + (PAYMENT_WINDOW_MIN - 1) * 60_000);
    expect(order.input.expiresAt.getTime()).toBe(res.holdExpiresAt!.getTime());
    const rows = await payments(held.bookingId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("created");
  });

  test("a second call reuses the unexpired order instead of creating another", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const a = await begin(gw, held.bookingId);
    const b = await begin(gw, held.bookingId);
    expect(a.ok && b.ok && a.orderId === b.orderId).toBe(true);
    expect(gw.orders.size).toBe(1);
    expect(await payments(held.bookingId)).toHaveLength(1);
  });

  test("refuses a booking that is already confirmed", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId);
    if (!r.ok) throw new Error(r.error);
    gw.setStatus(r.orderId, "PAID");
    await settlePayment(ctx.db, gw, { orderId: r.orderId });
    const again = await begin(gw, held.bookingId);
    expect(again).toEqual({ ok: false, error: "already_confirmed" });
  });
});

describe("settlePayment", () => {
  test("an unpaid order is pending and the seats stay held", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId);
    if (!r.ok) throw new Error(r.error);
    const s = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    expect(s).toEqual({ ok: true, status: "pending", bookingId: held.bookingId });
    expect((await reservations(held.bookingId)).map((x) => x.status)).toEqual(["held"]);
  });

  test("a PAID order confirms the booking, records the payment and issues the ticket", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId, { memberId: "member-1" });
    if (!r.ok) throw new Error(r.error);
    gw.setStatus(r.orderId, "PAID");
    const s = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    expect(s.ok && s.status === "paid" && s.newlyConfirmed).toBe(true);
    if (!(s.ok && s.status === "paid")) return;
    expect(s.ticketToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await reservations(held.bookingId)).map((x) => x.status)).toEqual(["confirmed"]);
    const [p] = await payments(held.bookingId);
    expect(p.status).toBe("paid");
    expect(p.cfPaymentId).toBe(`pay_${r.orderId}`);
    expect(p.paymentMethod).toBe("upi");
    expect(p.paidAt).not.toBeNull();
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, held.bookingId));
    expect(b.memberId).toBe("member-1");
  });

  test("settling the same PAID order twice confirms once", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId);
    if (!r.ok) throw new Error(r.error);
    gw.setStatus(r.orderId, "PAID");
    const first = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    const second = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    expect(first.ok && first.status === "paid" && first.newlyConfirmed).toBe(true);
    expect(second.ok && second.status === "paid" && second.newlyConfirmed).toBe(false);
    if (first.ok && first.status === "paid" && second.ok && second.status === "paid") {
      expect(second.ticketToken).toBe(first.ticketToken);
    }
    expect(await payments(held.bookingId)).toHaveLength(1);
  });

  test("a payment that lands after the hold lapsed still confirms the seat", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId);
    if (!r.ok) throw new Error(r.error);
    await ctx.db.execute(sql`UPDATE reservation SET hold_expires_at = now() - interval '1 minute' WHERE booking_id = ${held.bookingId}`);
    await sweepExpiredHolds(ctx.db);
    expect((await reservations(held.bookingId)).map((x) => x.status)).toEqual(["expired"]);
    gw.setStatus(r.orderId, "PAID");
    const s = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    expect(s.ok && s.status === "paid").toBe(true);
    expect((await reservations(held.bookingId)).map((x) => x.status)).toEqual(["confirmed"]);
  });

  test("a payment for a seat someone else now holds is flagged refund_due", async () => {
    const gw = new FakeGateway();
    const a = await holdOne();
    const r = await begin(gw, a.bookingId);
    if (!r.ok) throw new Error(r.error);
    await ctx.db.execute(sql`UPDATE reservation SET hold_expires_at = now() - interval '1 minute' WHERE booking_id = ${a.bookingId}`);
    await sweepExpiredHolds(ctx.db);
    const b = await holdOne(); // same room, same window
    gw.setStatus(r.orderId, "PAID");
    const s = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    expect(s).toEqual({ ok: true, status: "refund_due", bookingId: a.bookingId });
    expect((await reservations(a.bookingId)).map((x) => x.status)).toEqual(["expired"]);
    expect((await reservations(b.bookingId)).map((x) => x.status)).toEqual(["held"]);
    expect((await payments(a.bookingId))[0].status).toBe("refund_due");
  });

  test("a payment that lands after staff cancelled the booking is refund_due, not paid", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId);
    if (!r.ok) throw new Error(r.error);
    await ctx.db.update(schema.reservation).set({ status: "cancelled" }).where(eq(schema.reservation.bookingId, held.bookingId));
    await ctx.db.update(schema.booking).set({ status: "cancelled" }).where(eq(schema.booking.id, held.bookingId));
    gw.setStatus(r.orderId, "PAID");
    const s = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    expect(s).toEqual({ ok: true, status: "refund_due", bookingId: held.bookingId });
    expect((await payments(held.bookingId))[0].status).toBe("refund_due");
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, held.bookingId));
    expect(b.ticketToken).toBeNull();
  });

  test("a second order paid for an already-paid booking is refund_due", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const first = await begin(gw, held.bookingId);
    if (!first.ok) throw new Error(first.error);
    // The first attempt was reported failed, so the guest paid again…
    await ctx.db.update(schema.payment).set({ status: "failed" }).where(eq(schema.payment.orderId, first.orderId));
    const second = await begin(gw, held.bookingId);
    if (!second.ok) throw new Error(second.error);
    expect(second.orderId).not.toBe(first.orderId);
    // …but both orders ended up PAID at Cashfree.
    gw.setStatus(second.orderId, "PAID");
    gw.setStatus(first.orderId, "PAID");
    const a = await settlePayment(ctx.db, gw, { orderId: second.orderId });
    const b = await settlePayment(ctx.db, gw, { orderId: first.orderId });
    expect(a.ok && a.status === "paid").toBe(true);
    expect(b).toEqual({ ok: true, status: "refund_due", bookingId: held.bookingId });
    const rows = await payments(held.bookingId);
    expect(rows.map((p) => p.status).sort()).toEqual(["paid", "refund_due"]);
  });

  test("the order and customer ids sent to Cashfree do not embed the booking id", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId);
    if (!r.ok) throw new Error(r.error);
    const bare = held.bookingId.replace(/-/g, "");
    expect(r.orderId).not.toContain(bare);
    expect(gw.orders.get(r.orderId)!.input.customerId).not.toContain(bare);
    expect(gw.orders.get(r.orderId)!.input.customerId).toMatch(/^[A-Za-z0-9]{3,50}$/);
  });

  test("an EXPIRED order marks the payment expired", async () => {
    const gw = new FakeGateway();
    const held = await holdOne();
    const r = await begin(gw, held.bookingId);
    if (!r.ok) throw new Error(r.error);
    gw.setStatus(r.orderId, "EXPIRED");
    const s = await settlePayment(ctx.db, gw, { orderId: r.orderId });
    expect(s).toEqual({ ok: true, status: "expired", bookingId: held.bookingId });
    expect((await payments(held.bookingId))[0].status).toBe("expired");
  });

  test("an unknown order id is not found", async () => {
    const gw = new FakeGateway();
    expect(await settlePayment(ctx.db, gw, { orderId: "cbx_nope_1" })).toEqual({ ok: false, error: "not_found" });
  });
});
