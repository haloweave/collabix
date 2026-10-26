// Front-desk attendance stamps on a booking's confirmed reservations. For
// multi-day bookings "checked in" is per IST day: a stamp from an earlier day
// doesn't count, so the next day's scan stamps afresh. A single booking keeps
// its stamps for its whole window, even past midnight. Both updates are
// conditional, so concurrent scans of one ticket write once.

import { and, eq, gte, isNotNull, isNull, lt, not, or, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Db } from "./reservations";
import { istDayStart } from "./ticket";

const r = schema.reservation;
// Mirrors isMultiDay in ./ticket: a reservation of 24 hours or more.
const multiDay = sql`${r.endAt} - ${r.startAt} >= interval '24 hours'`;

/** Returns true if this call checked the booking in. */
export async function stampCheckIn(db: Db, bookingId: string, now = new Date()): Promise<boolean> {
  const today = istDayStart(now);
  const rows = await db
    .update(r)
    .set({ checkedInAt: now, checkedOutAt: null })
    .where(
      and(
        eq(r.bookingId, bookingId),
        eq(r.status, "confirmed"),
        or(isNull(r.checkedInAt), and(multiDay, lt(r.checkedInAt, today))),
      ),
    )
    .returning({ id: r.id });
  return rows.length > 0;
}

/** Returns true if this call checked the booking out (only if currently in). */
export async function stampCheckOut(db: Db, bookingId: string, now = new Date()): Promise<boolean> {
  const today = istDayStart(now);
  const rows = await db
    .update(r)
    .set({ checkedOutAt: now })
    .where(
      and(
        eq(r.bookingId, bookingId),
        eq(r.status, "confirmed"),
        isNotNull(r.checkedInAt),
        or(not(multiDay), gte(r.checkedInAt, today)),
        isNull(r.checkedOutAt),
      ),
    )
    .returning({ id: r.id });
  return rows.length > 0;
}
