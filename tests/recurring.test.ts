import { describe, expect, test } from "vitest";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { holdReservation } from "../lib/domain/reservations";
import { holdSeries, seriesDates, upcomingInSeries } from "../lib/domain/recurring";
import { setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();
const NOW = new Date("2026-11-20T10:00:00+05:30");
const room = {
  productKey: "meeting-4",
  date: "2026-12-01", // a Tuesday
  start: 10,
  duration: 2,
  customerName: "Weekly Standup",
  customerEmail: "team@example.com",
};

describe("seriesDates", () => {
  test("daily, weekly and weekdays-only runs", () => {
    expect(seriesDates("2026-12-04", "day", 3)).toEqual(["2026-12-04", "2026-12-05", "2026-12-06"]);
    expect(seriesDates("2026-12-01", "week", 3)).toEqual(["2026-12-01", "2026-12-08", "2026-12-15"]);
    // Fri → skips Sat/Sun → Mon, Tue
    expect(seriesDates("2026-12-04", "weekday", 3)).toEqual(["2026-12-04", "2026-12-07", "2026-12-08"]);
    // Month and year boundaries
    expect(seriesDates("2026-12-29", "week", 2)).toEqual(["2026-12-29", "2027-01-05"]);
  });
});

describe("holdSeries", () => {
  test("holds every date as its own booking, linked by one series id", async () => {
    const res = await holdSeries(ctx.db, { ...room, every: "week", count: 4 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dates).toEqual(["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22"]);
    expect(res.bookingIds).toHaveLength(4);
    const rows = await ctx.db.select().from(schema.booking).where(inArray(schema.booking.id, res.bookingIds));
    expect(new Set(rows.map((r) => r.seriesId))).toEqual(new Set([res.seriesId]));
    expect(res.totalMinor).toBe(4 * 82600);
    expect(await upcomingInSeries(ctx.db, res.seriesId, NOW)).toHaveLength(4);
    expect(await upcomingInSeries(ctx.db, res.seriesId, new Date("2026-12-09T00:00:00+05:30"))).toHaveLength(2);
  });

  test("all or nothing: one clash releases every hold and names the date", async () => {
    // The boardroom is a single room, so one booking blocks it.
    const board = { ...room, productKey: "boardroom" };
    const blocker = await holdReservation(ctx.db, { ...board, date: "2026-12-15", customerEmail: "other@example.com" }, NOW);
    expect(blocker.ok).toBe(true);
    const before = await ctx.db.select().from(schema.booking);

    const res = await holdSeries(ctx.db, { ...board, every: "week", count: 4 }, NOW);
    expect(res).toEqual({ ok: false, error: "seat_unavailable", date: "2026-12-15" });
    const after = await ctx.db.select().from(schema.booking);
    expect(after).toHaveLength(before.length);
    const left = await ctx.db.select().from(schema.booking).where(eq(schema.booking.customerEmail, "team@example.com"));
    expect(left).toHaveLength(0);
  });

  test("refuses a series of one or more than twelve", async () => {
    expect(await holdSeries(ctx.db, { ...room, every: "week", count: 1 }, NOW)).toEqual({ ok: false, error: "bad_count" });
    expect(await holdSeries(ctx.db, { ...room, every: "week", count: 13 }, NOW)).toEqual({ ok: false, error: "bad_count" });
  });
});
