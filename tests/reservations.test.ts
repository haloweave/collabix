import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  confirmBooking,
  getAvailability,
  holdReservation,
  sweepExpiredHolds,
} from "../lib/domain/reservations";
import {
  makeClient,
  migrateDb,
  resetBookings,
  seedInventory,
  type TestDb,
} from "./helpers/db";
import { eq, sql } from "drizzle-orm";
import * as authSchema from "../lib/db/auth-schema";

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
  // Re-seed inventory fresh each test for isolation.
  await client`TRUNCATE TABLE "resource","rate_plan","zone","floor","location" RESTART IDENTITY CASCADE`;
  await seedInventory(db);
});

const guest = { customerName: "Test Guest", customerEmail: "guest@example.com" };
const DATE = "2026-12-01";
const dayPass = { productKey: "day-full", date: DATE };
const room = (start: number, duration: number, productKey = "meeting-4") => ({
  productKey,
  date: DATE,
  start,
  duration,
});

async function slots(input: Parameters<typeof getAvailability>[1]) {
  const r = await getAvailability(db, input);
  if (!r.ok) throw new Error(r.error);
  return r.resources;
}

describe("day passes", () => {
  test("a pass for 3 people holds 3 desks at the tariff price", async () => {
    const held = await holdReservation(db, { ...dayPass, people: 3, ...guest });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.reservationIds.length).toBe(3);
    // Full Day Pass ₹399 × 3 + 18% GST.
    expect(held.quote.totalMinor).toBe(141246);
    const taken = (await slots(dayPass)).filter((s) => !s.available).length;
    expect(taken).toBe(3);
  });

  test("a pass for more people than free desks is refused and holds nothing", async () => {
    const r = await holdReservation(db, { ...dayPass, people: 29, ...guest });
    expect(r).toEqual({ ok: false, error: "not_enough_desks" });
    expect((await slots(dayPass)).every((s) => s.available)).toBe(true);
  });

  test("a hold then confirm succeeds", async () => {
    const held = await holdReservation(db, { ...dayPass, people: 1, ...guest });
    if (!held.ok) throw new Error("hold failed");
    const confirmed = await confirmBooking(db, { bookingId: held.bookingId });
    expect(confirmed.ok).toBe(true);
  });

  test("an expired hold cannot be confirmed", async () => {
    const held = await holdReservation(db, { ...dayPass, people: 1, ...guest, holdMinutes: -1 });
    if (!held.ok) throw new Error("hold failed");
    const c = await confirmBooking(db, { bookingId: held.bookingId });
    expect(c.ok).toBe(false);
  });
});

describe("availability reports every other space too", () => {
  test("a day pass gets the rooms and cabins with their state for the window", async () => {
    await holdReservation(db, { ...room(10, 2), ...guest });
    const r = await getAvailability(db, dayPass);
    if (!r.ok) throw new Error(r.error);
    expect(r.others.map((c) => c.code)).toEqual(["C-01", "C-02", "C-03", "C-04", "M-01", "M-02"]);
    expect(r.others.find((c) => c.code === "M-02")!.available).toBe(false);
    expect(r.others.find((c) => c.code === "M-01")!.available).toBe(true);
    expect(r.resources.every((c) => c.code.startsWith("D-"))).toBe(true);
  });

  test("a room gets the desks, cabins and the other room", async () => {
    const r = await getAvailability(db, room(10, 1));
    if (!r.ok) throw new Error(r.error);
    expect(r.resources.map((c) => c.code)).toEqual(["M-02"]);
    const codes = r.others.map((c) => c.code);
    expect(codes).toContain("M-01");
    expect(codes).toContain("D-01");
    expect(codes).not.toContain("M-02");
  });
});

describe("guests picking some of their desks", () => {
  const desk = async (code: string) => (await slots(dayPass)).find((s) => s.code === code)!;
  const takenCodes = async () => (await slots(dayPass)).filter((s) => !s.available).map((s) => s.code);

  test("a pass for 3 with one desk picked keeps that desk and adds two more", async () => {
    const d = await desk("D-12");
    const held = await holdReservation(db, { ...dayPass, people: 3, resourceIds: [d.resourceId], ...guest });
    if (!held.ok) throw new Error(held.error);
    expect(held.reservationIds).toHaveLength(3);
    const taken = await takenCodes();
    expect(taken).toContain("D-12");
    expect(taken).toHaveLength(3);
  });
});

describe("staff picking exact desks", () => {
  const desk = async (code: string) => (await slots(dayPass)).find((s) => s.code === code)!;

  test("an exact pick reserves that desk", async () => {
    const d = await desk("D-04");
    const held = await holdReservation(db, { ...dayPass, people: 1, resourceIds: [d.resourceId], exactSeats: true, ...guest });
    expect(held.ok).toBe(true);
    expect((await desk("D-04")).available).toBe(false);
  });

  test("an exact pick of a taken desk is refused instead of swapped", async () => {
    const d = await desk("D-04");
    const first = await holdReservation(db, { ...dayPass, people: 1, resourceIds: [d.resourceId], ...guest });
    expect(first.ok).toBe(true);
    const second = await holdReservation(db, { ...dayPass, people: 1, resourceIds: [d.resourceId], exactSeats: true, ...guest });
    expect(second).toEqual({ ok: false, error: "seat_taken" });
  });

  test("an exact pick must name one desk per person", async () => {
    const d = await desk("D-04");
    const r = await holdReservation(db, { ...dayPass, people: 2, resourceIds: [d.resourceId], exactSeats: true, ...guest });
    expect(r).toEqual({ ok: false, error: "seat_count" });
  });

  test("without exactSeats a taken pick still falls back to a free desk (guest flow)", async () => {
    const d = await desk("D-04");
    await holdReservation(db, { ...dayPass, people: 1, resourceIds: [d.resourceId], ...guest });
    const again = await holdReservation(db, { ...dayPass, people: 1, resourceIds: [d.resourceId], ...guest });
    expect(again.ok).toBe(true);
  });
});

describe("rooms", () => {
  test("a room product only ever reserves its own room", async () => {
    const m02 = (await slots(room(10, 2, "meeting-4")))[0];
    const held = await holdReservation(db, {
      ...room(10, 2, "boardroom"),
      resourceIds: [m02.resourceId],
      ...guest,
    });
    expect(held.ok).toBe(true);
    // The boardroom (M-01) is taken; the 4-seater (M-02) is still free.
    expect((await slots(room(10, 2, "boardroom")))[0]).toMatchObject({ code: "M-01", available: false });
    expect((await slots(room(10, 2, "meeting-4")))[0]).toMatchObject({ code: "M-02", available: true });
  });

  test("a 4-seater booking into the evening carries the after-hours charge", async () => {
    const held = await holdReservation(db, { ...room(19, 3), ...guest });
    if (!held.ok) throw new Error("hold failed");
    // 1 h × ₹350 + 2 h × ₹420, + 18% GST.
    expect(held.quote.totalMinor).toBe(140420);
  });
});

describe("double-booking prevention (the headline guarantee)", () => {
  test("two concurrent holds for the same room and window: exactly one wins", async () => {
    const results = await Promise.allSettled([
      holdReservation(db, { ...room(9, 2), ...guest }),
      holdReservation(db, { ...room(9, 2), ...guest }),
    ]);
    const oks = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    expect(oks).toBe(1);
  });

  test("adjacent windows on one room both succeed (half-open ranges)", async () => {
    const a = await holdReservation(db, { ...room(8, 2), ...guest });
    const b = await holdReservation(db, { ...room(10, 2), ...guest });
    expect(a.ok && b.ok).toBe(true);
  });

  test("an overlapping window on the same room is rejected", async () => {
    const a = await holdReservation(db, { ...room(8, 2), ...guest });
    const b = await holdReservation(db, { ...room(9, 2), ...guest });
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, error: "seat_unavailable" });
  });
});

describe("hold expiry frees the seat", () => {
  test("an expired hold is swept and the room can be re-held", async () => {
    const first = await holdReservation(db, { ...room(9, 2), ...guest, holdMinutes: -1 });
    expect(first.ok).toBe(true);
    expect(await sweepExpiredHolds(db)).toBeGreaterThanOrEqual(1);
    const second = await holdReservation(db, { ...room(9, 2), ...guest });
    expect(second.ok).toBe(true);
  });
});

describe("only tariff products can be booked", () => {
  test("a product key outside the tariff is refused", async () => {
    const r = await holdReservation(db, { productKey: "hotdesk", date: DATE, ...guest });
    expect(r).toEqual({ ok: false, error: "unknown_product" });
  });
});

describe("checkout fills in a new account's details", () => {
  const phone = "+919000000077";
  const placeholder = { name: phone, email: `${phone}@phone.collabix.local` };

  async function member(id: string, fields: { name: string; email: string }) {
    await db.delete(authSchema.user).where(eq(authSchema.user.id, id));
    await db.insert(authSchema.user).values({ id, ...fields, phoneNumber: id === "t-new" ? phone : null });
    return id;
  }
  async function account(id: string) {
    const [u] = await db.select().from(authSchema.user).where(eq(authSchema.user.id, id));
    return u;
  }

  afterAll(async () => {
    await db.delete(authSchema.user).where(inArrayIds(["t-new", "t-other"]));
  });
  const inArrayIds = (ids: string[]) => sql`${authSchema.user.id} in ${ids}`;

  test("a phone-only account takes the name and email given at checkout", async () => {
    const id = await member("t-new", placeholder);
    const held = await holdReservation(db, { ...dayPass, people: 1, ...guest });
    if (!held.ok) throw new Error("hold failed");
    expect((await confirmBooking(db, { bookingId: held.bookingId, memberId: id })).ok).toBe(true);
    expect(await account(id)).toMatchObject({ name: guest.customerName, email: guest.customerEmail });
  });

  test("an account with its own details keeps them", async () => {
    const id = await member("t-new", { name: "Real Name", email: "real@example.com" });
    const held = await holdReservation(db, { ...dayPass, people: 1, ...guest });
    if (!held.ok) throw new Error("hold failed");
    await confirmBooking(db, { bookingId: held.bookingId, memberId: id });
    expect(await account(id)).toMatchObject({ name: "Real Name", email: "real@example.com" });
  });

  test("an email another account already uses is not taken", async () => {
    await member("t-other", { name: "Someone", email: guest.customerEmail });
    const id = await member("t-new", placeholder);
    const held = await holdReservation(db, { ...dayPass, people: 1, ...guest });
    if (!held.ok) throw new Error("hold failed");
    expect((await confirmBooking(db, { bookingId: held.bookingId, memberId: id })).ok).toBe(true);
    expect(await account(id)).toMatchObject({ name: guest.customerName, email: placeholder.email });
  });
});
