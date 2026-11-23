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
    const held = await holdTerm(db, { ...months("dedicated-desk", 3), ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(held.reservationIds).toHaveLength(1);
    expect(await heldCode(held.reservationIds[0])).toMatch(/^D-/);
    // ₹8,500 × 3 + 18% GST.
    expect(held.quote.totalMinor).toBe(3009000);
    expect(await free(months("dedicated-desk", 1))).toBe(27);
  });

  test("a cabin term takes a cabin, never a meeting room", async () => {
    const held = await holdTerm(db, { ...months("cabin-pro", 1), ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(await heldCode(held.reservationIds[0])).toMatch(/^C-0[1-4]$/);
    expect(await free(months("cabin-base", 1))).toBe(3);
  });

  test("a team term holds one desk per space, all for the whole term", async () => {
    const held = await holdTerm(db, { ...months("dedicated-desk", 3), spaces: 3, ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(held.reservationIds).toHaveLength(3);
    const codes = await Promise.all(held.reservationIds.map(heldCode));
    expect(new Set(codes).size).toBe(3);
    // ₹8,500 × 3 months × 3 desks + 18% GST.
    expect(held.quote.totalMinor).toBe(9027000);
    expect(await free(months("dedicated-desk", 1))).toBe(25);
  });

  test("a cabin term can take several cabins, but not more than are free", async () => {
    const two = await holdTerm(db, { ...months("cabin-base", 1), spaces: 2, ...guest });
    if (!two.ok) throw new Error(two.error);
    expect((await Promise.all(two.reservationIds.map(heldCode))).every((c) => /^C-0[1-4]$/.test(c))).toBe(true);
    const three = await holdTerm(db, { ...months("cabin-base", 1), spaces: 3, ...guest });
    expect(three).toEqual({ ok: false, error: "seat_unavailable" });
    expect(await free(months("cabin-base", 1))).toBe(2);
  });

  test("an annual term is priced from the Annual column", async () => {
    const held = await holdTerm(db, { planKey: "dedicated-desk", date: START, unit: "year", count: 2, ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(held.quote.subtotalMinor).toBe(20400000);
  });

  test("a day pass inside the term cannot take the held desk", async () => {
    const day = addMonths(START, 1);
    for (let i = 0; i < 28; i++) {
      const r = await holdTerm(db, { ...months("dedicated-desk", 2), ...guest });
      expect(r.ok).toBe(true);
    }
    const pass = await holdReservation(db, { productKey: "day-full", date: day, people: 1, ...guest });
    expect(pass).toEqual({ ok: false, error: "not_enough_desks" });
  });

  test("a desk booked on any day of the term is not offered for it", async () => {
    const day = addMonths(START, 2);
    const pass = await holdReservation(db, { productKey: "day-full", date: day, people: 28, ...guest });
    expect(pass.ok).toBe(true);
    expect(await free(months("dedicated-desk", 3))).toBe(0);
    expect(await holdTerm(db, { ...months("dedicated-desk", 3), ...guest })).toEqual({ ok: false, error: "seat_unavailable" });
    // A term ending before that day is unaffected.
    expect(await free(months("dedicated-desk", 1))).toBe(28);
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
    const r = await holdTerm(db, { ...months("dedicated-desk", 12), ...guest });
    expect(r.ok).toBe(false);
  });

  test("Hot Desk Flexi is no longer sold, alone or in a mix", async () => {
    expect(await holdTerm(db, { ...months("hot-desk", 1), ...guest })).toEqual({ ok: false, error: "unknown_plan" });
    const mixed = await holdTerm(db, {
      items: [{ planKey: "dedicated-desk", spaces: 1 }, { planKey: "hot-desk", spaces: 1 }],
      date: START,
      unit: "month",
      count: 1,
      ...guest,
    });
    expect(mixed).toEqual({ ok: false, error: "unknown_plan" });
  });

  test("meeting-room availability ignores cabin terms", async () => {
    for (let i = 0; i < 4; i++) await holdTerm(db, { ...months("cabin-base", 1), ...guest });
    const r = await getAvailability(db, { productKey: "boardroom", date: START, start: 10, duration: 1 });
    expect(r.ok && r.resources.every((s) => s.available)).toBe(true);
  });
});

describe("a mix of plans in one booking", () => {
  const mix = (items: { planKey: string; spaces: number }[], count = 3) => ({
    items,
    date: START,
    unit: "month" as const,
    count,
    ...guest,
  });

  async function heldByPlan(bookingId: string) {
    const rows = await db
      .select({ plan: schema.ratePlan.key, code: schema.resource.code })
      .from(schema.reservation)
      .innerJoin(schema.resource, eq(schema.resource.id, schema.reservation.resourceId))
      .innerJoin(schema.ratePlan, eq(schema.ratePlan.id, schema.reservation.ratePlanId))
      .where(eq(schema.reservation.bookingId, bookingId));
    const out: Record<string, string[]> = {};
    for (const r of rows) (out[r.plan] ??= []).push(r.code);
    for (const codes of Object.values(out)) codes.sort();
    return out;
  }

  async function idOf(code: string) {
    const [row] = await db.select({ id: schema.resource.id }).from(schema.resource).where(eq(schema.resource.code, code));
    return row.id;
  }

  test("desks and a cabin are held together, each under its own plan, for one price", async () => {
    const held = await holdTerm(
      db,
      mix([
        { planKey: "cabin-base", spaces: 1 },
        { planKey: "dedicated-desk", spaces: 2 },
        { planKey: "dedicated-desk-pro", spaces: 1 },
      ]),
    );
    if (!held.ok) throw new Error(held.error);
    expect(held.reservationIds).toHaveLength(4);
    const byPlan = await heldByPlan(held.bookingId);
    expect(byPlan["cabin-base"]).toHaveLength(1);
    expect(byPlan["cabin-base"][0]).toMatch(/^C-0[1-4]$/);
    expect(byPlan["dedicated-desk"]).toHaveLength(2);
    expect(byPlan["dedicated-desk-pro"]).toHaveLength(1);
    expect(new Set(Object.values(byPlan).flat()).size).toBe(4);
    // (₹10,000 + ₹8,500 × 2 + ₹24,000) × 3 months, + 18% GST.
    expect(held.quote.subtotalMinor).toBe(15300000);
    expect(held.quote.totalMinor).toBe(18054000);
    expect(held.quote.lines).toHaveLength(3);
    expect(await free(months("dedicated-desk", 1))).toBe(25);
    expect(await free(months("cabin-base", 1))).toBe(3);
    expect((await confirmBooking(db, { bookingId: held.bookingId })).ok).toBe(true);
  });

  test("picked desks go to the fixed-desk plans and picked cabins to the cabin plans", async () => {
    const picks = await Promise.all(["D-11", "D-12", "C-03"].map(idOf));
    const held = await holdTerm(db, {
      ...mix([
        { planKey: "dedicated-desk", spaces: 1 },
        { planKey: "dedicated-desk-pro", spaces: 1 },
        { planKey: "cabin-pro", spaces: 1 },
      ]),
      resourceIds: picks,
    });
    if (!held.ok) throw new Error(held.error);
    const byPlan = await heldByPlan(held.bookingId);
    expect([...byPlan["dedicated-desk"], ...byPlan["dedicated-desk-pro"]].sort()).toEqual(["D-11", "D-12"]);
    expect(byPlan["cabin-pro"]).toEqual(["C-03"]);
  });

  test("the whole mix is refused if any part of it is not free", async () => {
    for (let i = 0; i < 4; i++) await holdTerm(db, { ...months("cabin-base", 1), ...guest });
    const held = await holdTerm(
      db,
      mix([
        { planKey: "dedicated-desk", spaces: 2 },
        { planKey: "cabin-base", spaces: 1 },
      ], 1),
    );
    expect(held).toEqual({ ok: false, error: "seat_unavailable" });
    expect(await free(months("dedicated-desk", 1))).toBe(28);
  });

  test("desk plans share the 28 desks", async () => {
    const held = await holdTerm(
      db,
      mix([
        { planKey: "dedicated-desk-pro", spaces: 15 },
        { planKey: "dedicated-desk", spaces: 14 },
      ]),
    );
    expect(held).toEqual({ ok: false, error: "seat_unavailable" });
  });

  test("the same plan listed twice is added up, and an unknown plan refuses the lot", async () => {
    const twice = await holdTerm(db, mix([{ planKey: "dedicated-desk", spaces: 1 }, { planKey: "dedicated-desk", spaces: 2 }]));
    if (!twice.ok) throw new Error(twice.error);
    expect(twice.reservationIds).toHaveLength(3);
    expect(twice.quote.lines).toHaveLength(1);
    const bad = await holdTerm(db, mix([{ planKey: "dedicated-desk", spaces: 1 }, { planKey: "day-full", spaces: 1 }]));
    expect(bad).toEqual({ ok: false, error: "unknown_plan" });
  });
});
