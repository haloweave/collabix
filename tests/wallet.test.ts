import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { holdReservation } from "../lib/domain/reservations";
import { cancelBookingRecord } from "../lib/domain/cancel";
import { addWalletEntry, payFromWallet, walletBalance, walletHistory } from "../lib/domain/wallet";
import { bookConfirmed, setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();
const USER = "user-wallet-1";

beforeEach(async () => {
  await ctx.client`TRUNCATE TABLE "wallet_entry"`;
});

async function hold() {
  const held = await holdReservation(ctx.db, {
    productKey: "meeting-4", date: "2026-12-01", start: 9, duration: 2,
    customerName: "Wallet User", customerEmail: "wallet@example.com",
  });
  if (!held.ok) throw new Error(held.error);
  return held; // ₹826 incl. GST
}

const topup = (amountMinor: number) =>
  addWalletEntry(ctx.db, { userId: USER, kind: "topup", amountMinor, method: "cash", by: "staff@x" });

describe("wallet entries", () => {
  test("top-ups, credits and adjustments add up; history is newest first", async () => {
    expect(await topup(50000)).toEqual({ ok: true, balanceMinor: 50000 });
    expect(await addWalletEntry(ctx.db, { userId: USER, kind: "credit", amountMinor: 10000, note: "welcome", by: "m" }))
      .toEqual({ ok: true, balanceMinor: 60000 });
    expect(await addWalletEntry(ctx.db, { userId: USER, kind: "adjust", amountMinor: -5000, by: "m" }))
      .toEqual({ ok: true, balanceMinor: 55000 });
    expect(await walletBalance(ctx.db, USER)).toBe(55000);
    const history = await walletHistory(ctx.db, USER);
    expect(history.map((h) => h.kind)).toEqual(["adjust", "credit", "topup"]);
  });

  test("refuses zero, negative top-ups, unknown methods and going below zero", async () => {
    expect(await topup(0)).toEqual({ ok: false, error: "bad_amount" });
    expect(await topup(-100)).toEqual({ ok: false, error: "bad_amount" });
    expect(await addWalletEntry(ctx.db, { userId: USER, kind: "topup", amountMinor: 100, method: "cheque", by: "s" }))
      .toEqual({ ok: false, error: "bad_method" });
    expect(await addWalletEntry(ctx.db, { userId: USER, kind: "adjust", amountMinor: -1, by: "s" }))
      .toEqual({ ok: false, error: "would_go_negative" });
  });
});

describe("payFromWallet", () => {
  test("pays and confirms a held booking, linking it to the payer", async () => {
    await topup(100000);
    const held = await hold();
    const res = await payFromWallet(ctx.db, { bookingId: held.bookingId, userId: USER, by: "member" });
    expect(res).toMatchObject({ ok: true, amountMinor: 82600, balanceMinor: 17400 });

    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, held.bookingId));
    expect(b.memberId).toBe(USER);
    expect(b.ticketToken).not.toBeNull();
    const [p] = await ctx.db.select().from(schema.payment).where(eq(schema.payment.bookingId, held.bookingId));
    expect(p).toMatchObject({ provider: "wallet", status: "paid", amountMinor: 82600 });

    expect(await payFromWallet(ctx.db, { bookingId: held.bookingId, userId: USER, by: "member" })).toEqual({
      ok: false,
      error: "not_payable",
    });
    expect(await walletBalance(ctx.db, USER)).toBe(17400);
  });

  test("charges nothing when the balance is short", async () => {
    await topup(50000);
    const held = await hold();
    expect(await payFromWallet(ctx.db, { bookingId: held.bookingId, userId: USER, by: "member" })).toEqual({
      ok: false,
      error: "insufficient_funds",
    });
    expect(await walletBalance(ctx.db, USER)).toBe(50000);
    const [r] = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.bookingId, held.bookingId));
    expect(r.status).toBe("held");
  });

  test("two concurrent spends can't overdraw", async () => {
    await topup(100000); // enough for one ₹826 booking, not two
    const a = await hold();
    const b = await holdReservation(ctx.db, {
      productKey: "meeting-4", date: "2026-12-02", start: 9, duration: 2,
      customerName: "Wallet User", customerEmail: "wallet@example.com",
    });
    if (!b.ok) throw new Error(b.error);
    const results = await Promise.all([
      payFromWallet(ctx.db, { bookingId: a.bookingId, userId: USER, by: "member" }),
      payFromWallet(ctx.db, { bookingId: b.bookingId, userId: USER, by: "member" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await walletBalance(ctx.db, USER)).toBe(17400);
  });

  test("the desk can charge a booking staff already confirmed", async () => {
    await topup(100000);
    const { bookingId } = await bookConfirmed(ctx.db);
    expect((await payFromWallet(ctx.db, { bookingId, userId: USER, by: "s" })).ok).toBe(false);
    expect(await payFromWallet(ctx.db, { bookingId, userId: USER, by: "s", allowConfirmed: true })).toMatchObject({
      ok: true,
      balanceMinor: 17400,
    });
  });

  test("cancelling a wallet-paid booking puts the money straight back", async () => {
    await topup(100000);
    const held = await hold();
    await payFromWallet(ctx.db, { bookingId: held.bookingId, userId: USER, by: "member" });
    const res = await cancelBookingRecord(ctx.db, { bookingId: held.bookingId, by: "member" });
    expect(res.ok && res.refund).toMatchObject({ provider: "wallet", amountMinor: 82600, settled: true });
    expect(await walletBalance(ctx.db, USER)).toBe(100000);
    const [p] = await ctx.db.select().from(schema.payment).where(eq(schema.payment.bookingId, held.bookingId));
    expect(p.refundStatus).toBe("refunded");
  });
});
