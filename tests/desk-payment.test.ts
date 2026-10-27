import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { holdReservation } from "../lib/domain/reservations";
import { recordDeskPayment, removeDeskPayment } from "../lib/domain/desk-payment";
import { bookConfirmed, setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();

const paymentsOf = (bookingId: string) =>
  ctx.db.select().from(schema.payment).where(eq(schema.payment.bookingId, bookingId));

describe("desk payments", () => {
  test("records the booking total as paid, once", async () => {
    const { bookingId } = await bookConfirmed(ctx.db); // 4-seater, 2h: ₹700 + GST
    const res = await recordDeskPayment(ctx.db, { bookingId, method: "cash", reference: " till 3 ", recordedBy: "staff-1" });
    expect(res).toEqual({ ok: true, amountMinor: 82600 });

    const [p] = await paymentsOf(bookingId);
    expect(p).toMatchObject({ provider: "desk", status: "paid", paymentMethod: "cash", amountMinor: 82600 });
    expect(p.raw).toEqual({ reference: "till 3", recordedBy: "staff-1" });

    expect(await recordDeskPayment(ctx.db, { bookingId, method: "upi", recordedBy: "staff-1" })).toEqual({
      ok: false,
      error: "already_paid",
    });
  });

  test("refuses unconfirmed or cancelled bookings and unknown methods", async () => {
    const held = await holdReservation(ctx.db, {
      productKey: "meeting-4", date: "2026-12-01", start: 14, duration: 1,
      customerName: "Held", customerEmail: "held@example.com",
    });
    if (!held.ok) throw new Error(held.error);
    expect(await recordDeskPayment(ctx.db, { bookingId: held.bookingId, method: "cash", recordedBy: "s" })).toEqual({
      ok: false,
      error: "not_confirmed",
    });

    const { bookingId } = await bookConfirmed(ctx.db);
    expect((await recordDeskPayment(ctx.db, { bookingId, method: "cheque", recordedBy: "s" })).ok).toBe(false);
    await ctx.db.update(schema.booking).set({ status: "cancelled" }).where(eq(schema.booking.id, bookingId));
    expect(await recordDeskPayment(ctx.db, { bookingId, method: "cash", recordedBy: "s" })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  test("removing it only deletes the desk payment", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    await recordDeskPayment(ctx.db, { bookingId, method: "card", recordedBy: "s" });
    expect(await removeDeskPayment(ctx.db, bookingId)).toBe(true);
    expect(await paymentsOf(bookingId)).toHaveLength(0);
    expect(await removeDeskPayment(ctx.db, bookingId)).toBe(false);
  });
});
