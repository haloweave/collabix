import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import {
  confirmBooking,
  getAvailability,
  getTermAvailability,
  holdReservation,
  holdTerm,
} from "../lib/domain/reservations";
import { addMonths } from "../lib/domain/term";
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
  await client`TRUNCATE TABLE "resource","rate_plan","zone","floor","location" RESTART IDENTITY CASCADE`;
  await seedInventory(db);
});

const guest = { customerName: "Test Guest", customerEmail: "guest@example.com" };
// Ten days from today (IST), so the term always starts in the future.
const START = new Date(Date.now() + 330 * 60_000 + 10 * 86_400_000).toISOString().slice(0, 10);
const months = (planKey: string, count: number, date = START) => ({ planKey, date, unit: "month" as const, count });

async function free(input: Parameters<typeof getTermAvailability>[1]) {
  const r = await getTermAvailability(db, input);
  if (!r.ok) throw new Error(r.error);
  return r.free;
}

async function heldCode(reservationId: string) {
  const [row] = await db
    .select({ code: schema.resource.code })
    .from(schema.reservation)
    .innerJoin(schema.resource, eq(schema.resource.id, schema.reservation.resourceId))
    .where(eq(schema.reservation.id, reservationId));
  return row.code;
}

describe("monthly & annual passes", () => {
  test("a desk term holds one desk for the whole term at the tariff price", async () => {
    const held = await holdTerm(db, { ...months("hot-desk", 3), ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(held.reservationIds).toHaveLength(1);
    expect(await heldCode(held.reservationIds[0])).toMatch(/^D-/);
    // ₹6,000 × 3 + 18% GST.
    expect(held.quote.totalMinor).toBe(2124000);
    expect(await free(months("hot-desk", 1))).toBe(27);
  });

  test("a cabin term takes a cabin, never a meeting room", async () => {
    const held = await holdTerm(db, { ...months("cabin-pro", 1), ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(await heldCode(held.reservationIds[0])).toMatch(/^C-0[1-4]$/);
    expect(await free(months("cabin-base", 1))).toBe(3);
  });

  test("an annual term is priced from the Annual column", async () => {
    const held = await holdTerm(db, { planKey: "dedicated-desk", date: START, unit: "year", count: 2, ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(held.quote.subtotalMinor).toBe(20400000);
  });

  test("a day pass inside the term cannot take the held desk", async () => {
    const day = addMonths(START, 1);
    for (let i = 0; i < 28; i++) {
      const r = await holdTerm(db, { ...months("hot-desk", 2), ...guest });
      expect(r.ok).toBe(true);
    }
    const pass = await holdReservation(db, { productKey: "day-full", date: day, people: 1, ...guest });
    expect(pass).toEqual({ ok: false, error: "not_enough_desks" });
  });

  test("a desk booked on any day of the term is not offered for it", async () => {
    const day = addMonths(START, 2);
    const pass = await holdReservation(db, { productKey: "day-full", date: day, people: 28, ...guest });
    expect(pass.ok).toBe(true);
    expect(await free(months("hot-desk", 3))).toBe(0);
    expect(await holdTerm(db, { ...months("hot-desk", 3), ...guest })).toEqual({ ok: false, error: "seat_unavailable" });
    // A term ending before that day is unaffected.
    expect(await free(months("hot-desk", 1))).toBe(28);
  });

  test("back-to-back terms on the same cabin do not overlap", async () => {
    for (let i = 0; i < 4; i++) await holdTerm(db, { ...months("cabin-base", 1), ...guest });
    expect(await free(months("cabin-base", 1))).toBe(0);
    expect(await free(months("cabin-base", 1, addMonths(START, 1)))).toBe(4);
  });

  test("a held term confirms like any booking", async () => {
    const held = await holdTerm(db, { ...months("dedicated-desk-pro", 6), ...guest });
    if (!held.ok) throw new Error(held.error);
    expect((await confirmBooking(db, { bookingId: held.bookingId })).ok).toBe(true);
  });

  test("an expired hold frees the space", async () => {
    await holdTerm(db, { ...months("cabin-enterprise", 1), ...guest, holdMinutes: -1 });
    expect(await free(months("cabin-enterprise", 1))).toBe(4);
  });

  test("unknown plans and invalid terms are refused", async () => {
    expect(await holdTerm(db, { ...months("day-full", 1), ...guest })).toEqual({ ok: false, error: "unknown_plan" });
    const r = await holdTerm(db, { ...months("hot-desk", 12), ...guest });
    expect(r.ok).toBe(false);
  });

  test("meeting-room availability ignores cabin terms", async () => {
    for (let i = 0; i < 4; i++) await holdTerm(db, { ...months("cabin-base", 1), ...guest });
    const r = await getAvailability(db, { productKey: "boardroom", date: START, start: 10, duration: 1 });
    expect(r.ok && r.resources.every((s) => s.available)).toBe(true);
  });
});
