import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { stampCheckIn, stampCheckOut } from "../lib/domain/checkin";
import { bookConfirmed, insertMultiDay, setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();
const ist = (s: string) => new Date(`${s}:00+05:30`);

async function stamps(bookingId: string) {
  return ctx.db
    .select({ in: schema.reservation.checkedInAt, out: schema.reservation.checkedOutAt })
    .from(schema.reservation)
    .where(eq(schema.reservation.bookingId, bookingId));
}

describe("stampCheckIn", () => {
  test("stamps every confirmed seat once; a second call is a no-op", async () => {
    const { bookingId } = await bookConfirmed(ctx.db, { seats: 3 });
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-01T08:45"))).toBe(true);
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-01T09:10"))).toBe(false);
    const rows = await stamps(bookingId);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.in?.toISOString()).toBe(ist("2026-12-01T08:45").toISOString());
  });

  test("two concurrent scans write exactly one check-in", async () => {
    const { bookingId } = await bookConfirmed(ctx.db, { seats: 3 });
    const now = ist("2026-12-01T09:00");
    const results = await Promise.all([
      stampCheckIn(ctx.db, bookingId, now),
      stampCheckIn(ctx.db, bookingId, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("multi-day: a new day re-checks-in and clears yesterday's check-out", async () => {
    const { bookingId } = await insertMultiDay(ctx.db, "2026-12-10", "2026-12-12");
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-10T09:00"))).toBe(true);
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-10T18:00"))).toBe(true);
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-10T19:00"))).toBe(false); // same day
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-11T09:05"))).toBe(true);
    const [r] = await stamps(bookingId);
    expect(r.in?.toISOString()).toBe(ist("2026-12-11T09:05").toISOString());
    expect(r.out).toBeNull();
  });
});

describe("stampCheckOut", () => {
  test("only checks out someone checked in today, once", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-01T10:00"))).toBe(false);
    await stampCheckIn(ctx.db, bookingId, ist("2026-12-01T09:00"));
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-01T10:30"))).toBe(true);
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-01T10:40"))).toBe(false);
  });
});
