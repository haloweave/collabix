import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { claimNoShows, claimReminders, claimRenewals } from "../lib/domain/notifications";
import { stampCheckIn } from "../lib/domain/checkin";
import { bookConfirmed, insertMultiDay, setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();
const ist = (s: string) => new Date(`${s}:00+05:30`);

/** Booked well in advance, so the reminder lead-time rule never blocks it. */
async function bookedEarly(opts: Parameters<typeof bookConfirmed>[1] = {}) {
  const b = await bookConfirmed(ctx.db, opts);
  await ctx.db.update(schema.booking).set({ createdAt: ist("2026-11-01T10:00") }).where(eq(schema.booking.id, b.bookingId));
  return b;
}

describe("claimReminders", () => {
  test("claims a booking starting tomorrow once", async () => {
    const { bookingId } = await bookedEarly(); // 2026-12-01 09:00 IST
    const now = ist("2026-11-30T18:00");
    expect(await claimReminders(ctx.db, now)).toEqual([bookingId]);
    expect(await claimReminders(ctx.db, now)).toEqual([]);
  });

  test("skips bookings too far off, already started, cancelled or made at the last minute", async () => {
    const { bookingId } = await bookedEarly();
    expect(await claimReminders(ctx.db, ist("2026-11-28T18:00"))).toEqual([]);
    expect(await claimReminders(ctx.db, ist("2026-12-01T10:00"))).toEqual([]);

    await ctx.db.update(schema.booking).set({ createdAt: ist("2026-12-01T06:00") }).where(eq(schema.booking.id, bookingId));
    expect(await claimReminders(ctx.db, ist("2026-12-01T07:00"))).toEqual([]);

    await ctx.db.update(schema.booking).set({ status: "cancelled", createdAt: ist("2026-11-01T10:00") }).where(eq(schema.booking.id, bookingId));
    expect(await claimReminders(ctx.db, ist("2026-11-30T18:00"))).toEqual([]);
  });
});

describe("claimNoShows", () => {
  test("flags an ended booking nobody checked in to, once", async () => {
    const { bookingId } = await bookConfirmed(ctx.db); // ends 11:00 IST
    expect(await claimNoShows(ctx.db, ist("2026-12-01T10:30"))).toEqual([]);
    expect(await claimNoShows(ctx.db, ist("2026-12-01T18:00"))).toEqual([bookingId]);
    expect(await claimNoShows(ctx.db, ist("2026-12-01T19:00"))).toEqual([]);
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
    expect(b.noShowAt).not.toBeNull();
  });

  test("a check-in, a multi-day stay or old history is never a no-show", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    await stampCheckIn(ctx.db, bookingId, ist("2026-12-01T09:05"));
    await insertMultiDay(ctx.db, "2026-12-01", "2026-12-03");
    expect(await claimNoShows(ctx.db, ist("2026-12-04T18:00"))).toEqual([]);

    const old = await bookConfirmed(ctx.db, { start: 14 });
    expect(await claimNoShows(ctx.db, ist("2026-12-10T18:00"))).toEqual([]);
    expect(old.bookingId).toBeTruthy();
  });
});

describe("claimRenewals", () => {
  test("nudges a month-long pass in its last week, once, unless already renewed", async () => {
    const { bookingId } = await insertMultiDay(ctx.db, "2026-12-01", "2026-12-31");
    expect(await claimRenewals(ctx.db, ist("2026-12-20T18:00"))).toEqual([]);
    expect(await claimRenewals(ctx.db, ist("2026-12-26T18:00"))).toEqual([bookingId]);
    expect(await claimRenewals(ctx.db, ist("2026-12-27T18:00"))).toEqual([]);
  });

  test("skips a pass the customer has already renewed", async () => {
    await insertMultiDay(ctx.db, "2026-12-01", "2026-12-31");
    await insertMultiDay(ctx.db, "2027-01-01", "2027-01-31");
    expect(await claimRenewals(ctx.db, ist("2026-12-26T18:00"))).toEqual([]);
  });

  test("short bookings never get a renewal nudge", async () => {
    await bookConfirmed(ctx.db);
    expect(await claimRenewals(ctx.db, ist("2026-11-28T18:00"))).toEqual([]);
  });
});
