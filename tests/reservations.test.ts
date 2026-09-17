import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  confirmReservation,
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

async function firstDeskId(): Promise<string> {
  const avail = await getAvailability(db, { planKey: "hotdesk", ...slot });
  return avail.find((r) => r.available)!.resourceId;
}

describe("hold + confirm", () => {
  test("a hold then confirm succeeds and persists the reservation", async () => {
    const resourceId = await firstDeskId();
    const held = await holdReservation(db, {
      planKey: "hotdesk",
      resourceId,
      ...slot,
      ...guest,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.quote.totalMinor).toBe(12000 * 2 + Math.round(12000 * 2 * 0.18));

    const confirmed = await confirmReservation(db, { reservationId: held.reservationId });
    expect(confirmed.ok).toBe(true);
  });
});

describe("double-booking prevention (the headline guarantee)", () => {
  test("two concurrent holds for the same seat and window: exactly one wins", async () => {
    const resourceId = await firstDeskId();
    const results = await Promise.allSettled([
      holdReservation(db, { planKey: "hotdesk", resourceId, ...slot, ...guest }),
      holdReservation(db, { planKey: "hotdesk", resourceId, ...slot, ...guest }),
    ]);
    const oks = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    ).length;
    expect(oks).toBe(1);
  });

  test("adjacent windows on one seat both succeed (half-open ranges)", async () => {
    const resourceId = await firstDeskId();
    const a = await holdReservation(db, {
      planKey: "hotdesk", resourceId, date: "2026-12-01", start: 8, duration: 2, ...guest,
    });
    const b = await holdReservation(db, {
      planKey: "hotdesk", resourceId, date: "2026-12-01", start: 10, duration: 2, ...guest,
    });
    expect(a.ok && b.ok).toBe(true);
  });

  test("an overlapping window on the same seat is rejected", async () => {
    const resourceId = await firstDeskId();
    const a = await holdReservation(db, {
      planKey: "hotdesk", resourceId, date: "2026-12-01", start: 8, duration: 2, ...guest,
    });
    const b = await holdReservation(db, {
      planKey: "hotdesk", resourceId, date: "2026-12-01", start: 9, duration: 2, ...guest,
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });
});

describe("hold expiry frees the seat", () => {
  test("an expired hold is swept and the seat can be re-held", async () => {
    const resourceId = await firstDeskId();
    const first = await holdReservation(db, {
      planKey: "hotdesk", resourceId, ...slot, ...guest, holdMinutes: -1,
    });
    expect(first.ok).toBe(true);

    const swept = await sweepExpiredHolds(db);
    expect(swept).toBeGreaterThanOrEqual(1);

    const second = await holdReservation(db, {
      planKey: "hotdesk", resourceId, ...slot, ...guest,
    });
    expect(second.ok).toBe(true);
  });
});

describe("rate-plan / resource-kind validation", () => {
  test("a room rate plan on a desk resource is rejected", async () => {
    const resourceId = await firstDeskId();
    const r = await holdReservation(db, {
      planKey: "meeting", resourceId, ...slot, ...guest,
    });
    expect(r.ok).toBe(false);
  });
});

describe("availability reflects held seats", () => {
  test("a held seat is no longer available for the same window", async () => {
    const resourceId = await firstDeskId();
    await holdReservation(db, { planKey: "hotdesk", resourceId, ...slot, ...guest });
    const avail = await getAvailability(db, { planKey: "hotdesk", ...slot });
    expect(avail.find((r) => r.resourceId === resourceId)!.available).toBe(false);
  });
});
