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
const slot = { date: "2026-12-01", start: 9, duration: 2 };

async function availableDeskIds(n: number): Promise<string[]> {
  const avail = await getAvailability(db, { planKey: "hotdesk", ...slot });
  return avail
    .filter((r) => r.available)
    .slice(0, n)
    .map((r) => r.resourceId);
}

describe("hold + confirm", () => {
  test("a hold then confirm succeeds and persists the reservation", async () => {
    const resourceIds = await availableDeskIds(1);
    const held = await holdReservation(db, {
      planKey: "hotdesk",
      resourceIds,
      ...slot,
      ...guest,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.quote.totalMinor).toBe(12000 * 2 + Math.round(12000 * 2 * 0.18));

    const confirmed = await confirmBooking(db, { bookingId: held.bookingId });
    expect(confirmed.ok).toBe(true);
  });
});

describe("multi-seat booking", () => {
  test("holding N desks makes one booking with N reservations and scales the quote", async () => {
    const ids = await availableDeskIds(3);
    const held = await holdReservation(db, {
      planKey: "hotdesk",
      resourceIds: ids,
      ...slot,
      ...guest,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.reservationIds.length).toBe(3);
    expect(held.quote.seats).toBe(3);
    expect(held.quote.subtotalMinor).toBe(12000 * 2 * 3);

    const avail = await getAvailability(db, { planKey: "hotdesk", ...slot });
    for (const id of ids) {
      expect(avail.find((r) => r.resourceId === id)!.available).toBe(false);
    }
  });

  test("if one requested seat is taken, the whole hold fails and none are held", async () => {
    const [a, b] = await availableDeskIds(2);
    await holdReservation(db, {
      planKey: "hotdesk",
      resourceIds: [a],
      ...slot,
      ...guest,
    });
    const held = await holdReservation(db, {
      planKey: "hotdesk",
      resourceIds: [a, b],
      ...slot,
      ...guest,
    });
    expect(held.ok).toBe(false);
    // The other seat must remain free — no partial team booking.
    const avail = await getAvailability(db, { planKey: "hotdesk", ...slot });
    expect(avail.find((r) => r.resourceId === b)!.available).toBe(true);
  });

  test("confirmBooking confirms every reservation under the booking", async () => {
    const ids = await availableDeskIds(2);
    const held = await holdReservation(db, {
      planKey: "hotdesk",
      resourceIds: ids,
      ...slot,
      ...guest,
    });
    if (!held.ok) throw new Error("hold failed");
    const c = await confirmBooking(db, { bookingId: held.bookingId });
    expect(c.ok).toBe(true);
    const avail = await getAvailability(db, { planKey: "hotdesk", ...slot });
    for (const id of ids) {
      expect(avail.find((r) => r.resourceId === id)!.available).toBe(false);
    }
  });

  test("an expired hold cannot be confirmed", async () => {
    const ids = await availableDeskIds(1);
    const held = await holdReservation(db, {
      planKey: "hotdesk",
      resourceIds: ids,
      ...slot,
      ...guest,
      holdMinutes: -1,
    });
    if (!held.ok) throw new Error("hold failed");
    const c = await confirmBooking(db, { bookingId: held.bookingId });
    expect(c.ok).toBe(false);
  });
});

describe("double-booking prevention (the headline guarantee)", () => {
  test("two concurrent holds for the same seat and window: exactly one wins", async () => {
    const resourceIds = await availableDeskIds(1);
    const results = await Promise.allSettled([
      holdReservation(db, { planKey: "hotdesk", resourceIds, ...slot, ...guest }),
      holdReservation(db, { planKey: "hotdesk", resourceIds, ...slot, ...guest }),
    ]);
    const oks = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    ).length;
    expect(oks).toBe(1);
  });

  test("adjacent windows on one seat both succeed (half-open ranges)", async () => {
    const resourceIds = await availableDeskIds(1);
    const a = await holdReservation(db, {
      planKey: "hotdesk", resourceIds, date: "2026-12-01", start: 8, duration: 2, ...guest,
    });
    const b = await holdReservation(db, {
      planKey: "hotdesk", resourceIds, date: "2026-12-01", start: 10, duration: 2, ...guest,
    });
    expect(a.ok && b.ok).toBe(true);
  });

  test("an overlapping window on the same seat is rejected", async () => {
    const resourceIds = await availableDeskIds(1);
    const a = await holdReservation(db, {
      planKey: "hotdesk", resourceIds, date: "2026-12-01", start: 8, duration: 2, ...guest,
    });
    const b = await holdReservation(db, {
      planKey: "hotdesk", resourceIds, date: "2026-12-01", start: 9, duration: 2, ...guest,
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });
});

describe("hold expiry frees the seat", () => {
  test("an expired hold is swept and the seat can be re-held", async () => {
    const resourceIds = await availableDeskIds(1);
    const first = await holdReservation(db, {
      planKey: "hotdesk", resourceIds, ...slot, ...guest, holdMinutes: -1,
    });
    expect(first.ok).toBe(true);

    const swept = await sweepExpiredHolds(db);
    expect(swept).toBeGreaterThanOrEqual(1);

    const second = await holdReservation(db, {
      planKey: "hotdesk", resourceIds, ...slot, ...guest,
    });
    expect(second.ok).toBe(true);
  });
});

describe("rate-plan / resource-kind validation", () => {
  test("a room rate plan on a desk resource is rejected", async () => {
    const resourceIds = await availableDeskIds(1);
    const r = await holdReservation(db, {
      planKey: "meeting", resourceIds, ...slot, ...guest,
    });
    expect(r.ok).toBe(false);
  });
});

describe("availability reflects held seats", () => {
  test("a held seat is no longer available for the same window", async () => {
    const resourceIds = await availableDeskIds(1);
    await holdReservation(db, { planKey: "hotdesk", resourceIds, ...slot, ...guest });
    const avail = await getAvailability(db, { planKey: "hotdesk", ...slot });
    expect(avail.find((r) => r.resourceId === resourceIds[0])!.available).toBe(false);
  });
});
