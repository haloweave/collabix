// Front-desk attendance stamps on a booking's confirmed reservations. "Checked
// in" is per IST day: a stamp from an earlier day (multi-day bookings) doesn't
// count, so the next day's scan stamps afresh. Both updates are conditional,
// so concurrent scans of one ticket write once.

import { and, eq, gte, isNotNull, isNull, lt, or } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Db } from "./reservations";
import { istDayStart } from "./ticket";

const r = schema.reservation;

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
        or(isNull(r.checkedInAt), lt(r.checkedInAt, today)),
      ),
    )
    .returning({ id: r.id });
  return rows.length > 0;
}

/** Returns true if this call checked the booking out (only if in today). */
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
        gte(r.checkedInAt, today),
        isNull(r.checkedOutAt),
      ),
    )
    .returning({ id: r.id });
  return rows.length > 0;
}
