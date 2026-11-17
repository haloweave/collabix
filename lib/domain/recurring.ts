// Recurring bookings: the same product and time on a run of dates (daily,
// every weekday, or weekly), made together as a series. Each date is its own
// booking — own ticket, own invoice, cancellable alone — linked by series_id.
// Conflict policy is all-or-nothing: if any date can't be held, every hold
// already taken for the series is released and the clashing date is reported.

import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { holdReservation, type Db, type HoldInput } from "./reservations";

export type RepeatEvery = "day" | "weekday" | "week";
export const REPEAT_EVERY: { value: RepeatEvery; label: string }[] = [
  { value: "day", label: "Every day" },
  { value: "weekday", label: "Every weekday (Mon–Fri)" },
  { value: "week", label: "Every week" },
];
export const MIN_OCCURRENCES = 2;
export const MAX_OCCURRENCES = 12;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat

/** The `count` dates of a series starting on `date` (included, even on a weekend). */
export function seriesDates(date: string, every: RepeatEvery, count: number): string[] {
  const out = [date];
  let cur = date;
  while (out.length < count) {
    cur = addDays(cur, every === "week" ? 7 : 1);
    if (every === "weekday" && (weekday(cur) === 0 || weekday(cur) === 6)) continue;
    out.push(cur);
  }
  return out;
}

export type SeriesHoldResult =
  | { ok: true; seriesId: string; bookingIds: string[]; dates: string[]; totalMinor: number }
  | { ok: false; error: string; date?: string };

/** Hold every date of a series, or none of them. */
export async function holdSeries(
  db: Db,
  input: HoldInput & { every: RepeatEvery; count: number },
  now = new Date(),
): Promise<SeriesHoldResult> {
  if (!Number.isInteger(input.count) || input.count < MIN_OCCURRENCES || input.count > MAX_OCCURRENCES)
    return { ok: false, error: "bad_count" };
  if (!REPEAT_EVERY.some((r) => r.value === input.every)) return { ok: false, error: "bad_repeat" };

  const dates = seriesDates(input.date, input.every, input.count);
  const held: { bookingId: string; totalMinor: number }[] = [];
  // Each date is a fresh hold; one idempotency key can't cover several bookings.
  const base: HoldInput = { ...input, idempotencyKey: undefined };
  for (const date of dates) {
    const res = await holdReservation(db, { ...base, date }, now);
    if (!res.ok) {
      await releaseHolds(db, held.map((h) => h.bookingId));
      return { ok: false, error: res.error, date };
    }
    held.push({ bookingId: res.bookingId, totalMinor: res.quote.totalMinor });
  }

  const seriesId = randomUUID();
  const bookingIds = held.map((h) => h.bookingId);
  await db.update(schema.booking).set({ seriesId }).where(inArray(schema.booking.id, bookingIds));
  return { ok: true, seriesId, bookingIds, dates, totalMinor: held.reduce((s, h) => s + h.totalMinor, 0) };
}

/** Undo holds taken for a series that couldn't complete: they never existed for anyone. */
export async function releaseHolds(db: Db, bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.delete(schema.reservation).where(
      and(inArray(schema.reservation.bookingId, bookingIds), eq(schema.reservation.status, "held")),
    );
    await tx.delete(schema.booking).where(
      and(
        inArray(schema.booking.id, bookingIds),
        sql`NOT EXISTS (SELECT 1 FROM reservation r WHERE r.booking_id = ${schema.booking.id})`,
      ),
    );
  });
}

/** Active bookings in a series that haven't started yet, soonest first. */
export async function upcomingInSeries(db: Db, seriesId: string, now = new Date()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: schema.booking.id, startAt: schema.reservation.startAt })
    .from(schema.booking)
    .innerJoin(schema.reservation, eq(schema.reservation.bookingId, schema.booking.id))
    .where(
      and(
        eq(schema.booking.seriesId, seriesId),
        eq(schema.booking.status, "active"),
        gt(schema.reservation.startAt, now),
      ),
    )
    .orderBy(schema.reservation.startAt);
  return [...new Set(rows.map((r) => r.id))];
}
