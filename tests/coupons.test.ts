import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { findActiveCoupon, holdReservation, holdTerm } from "../lib/domain/reservations";
import { makeClient, migrateDb, resetBookings, seedInventory, type TestDb } from "./helpers/db";

let db: TestDb;
let client: ReturnType<typeof makeClient>["client"];

beforeAll(async () => {
  ({ db, client } = makeClient());
  await migrateDb(db);
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await resetBookings(db);
  await client`TRUNCATE TABLE "coupon","resource","rate_plan","zone","floor","location" RESTART IDENTITY CASCADE`;
  await seedInventory(db);
  await db.insert(schema.coupon).values([
    { code: "TEN", kind: "percent", value: 10 },
    { code: "OFF500", kind: "flat", value: 50000 },
    { code: "OLD", kind: "percent", value: 10, active: false },
    { code: "GONE", kind: "percent", value: 10, expiresAt: new Date(Date.now() - 60_000) },
    { code: "FREE", kind: "percent", value: 100 },
  ]);
});

const guest = { customerName: "Test Guest", customerEmail: "guest@example.com" };
const dayPass = { productKey: "day-full", date: "2026-12-01", people: 2 };
const START = new Date(Date.now() + 330 * 60_000 + 10 * 86_400_000).toISOString().slice(0, 10);
const deskTerm = { planKey: "dedicated-desk", date: START, unit: "month" as const, count: 6 };

async function savedQuote(reservationId: string) {
  const [row] = await db
    .select({ quote: schema.reservation.quoteSnapshot })
    .from(schema.reservation)
    .where(eq(schema.reservation.id, reservationId));
  return row.quote as { discount?: { code: string; amountMinor: number }; totalMinor: number };
}

describe("coupons", () => {
  test("a percentage coupon discounts a pass term before GST and is saved with the hold", async () => {
    const plain = await holdTerm(db, { ...deskTerm, ...guest });
    const held = await holdTerm(db, { ...deskTerm, ...guest, couponCode: " ten " });
    if (!plain.ok || !held.ok) throw new Error("hold failed");
    const off = Math.round(plain.quote.subtotalMinor / 10);
    expect(held.quote.discount).toEqual({ code: "TEN", amountMinor: off });
    expect(held.quote.totalMinor).toBe(Math.round((plain.quote.subtotalMinor - off) * 1.18));
    // Payment charges the saved quote, so the discount must be in it.
    expect(await savedQuote(held.reservationIds[0])).toMatchObject({
      discount: { code: "TEN" },
      totalMinor: held.quote.totalMinor,
    });
  });

  test("a flat coupon discounts a day pass", async () => {
    const held = await holdReservation(db, { ...dayPass, ...guest, couponCode: "off500" });
    if (!held.ok) throw new Error(held.error);
    expect(held.quote.discount?.amountMinor).toBe(50000);
    // 2 × ₹399 = ₹798, less ₹500 = ₹298, plus 18% GST.
    expect(held.quote.totalMinor).toBe(29800 + 5364);
  });

  test("inactive, expired and unknown codes are refused without holding a seat", async () => {
    for (const couponCode of ["OLD", "GONE", "NOPE"]) {
      expect(await holdTerm(db, { ...deskTerm, ...guest, couponCode })).toEqual({ ok: false, error: "invalid_coupon" });
    }
    expect(await db.select().from(schema.reservation)).toHaveLength(0);
  });

  test("a coupon that leaves nothing to pay is refused", async () => {
    expect(await holdReservation(db, { ...dayPass, ...guest, couponCode: "FREE" })).toEqual({
      ok: false,
      error: "coupon_covers_total",
    });
  });

  test("an empty code is no coupon", async () => {
    const held = await holdTerm(db, { ...deskTerm, ...guest, couponCode: "  " });
    if (!held.ok) throw new Error(held.error);
    expect(held.quote.discount).toBeUndefined();
  });

  test("findActiveCoupon matches without regard to case", async () => {
    expect(await findActiveCoupon(db, "ten")).toEqual({ code: "TEN", kind: "percent", value: 10 });
    expect(await findActiveCoupon(db, "old")).toBeNull();
  });
});
