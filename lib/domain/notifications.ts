// What the daily job owes customers: reminders before a visit, no-shows after
// one, and renewal nudges before a pass ends. Each function *claims* its
// bookings with a single UPDATE … RETURNING, stamping them in the same
// statement, so two overlapping runs can never email the same booking twice.

import { sql } from "drizzle-orm";
import type { Db } from "./reservations";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How far ahead a reminder looks: the 18:00 run covers all of tomorrow. */
export const REMINDER_LOOKAHEAD_H = 30;
/** Bookings made this close to their start already have the confirmation fresh in mind. */
export const REMINDER_MIN_LEAD_H = 6;
/** Passes ending within this many days get a renewal nudge. */
export const RENEWAL_NOTICE_DAYS = 7;
/** Only bookings up to this long can be no-shows; a monthly pass can't "miss" a day. */
const NO_SHOW_MAX_LENGTH_H = 24;
/** No-shows older than this are left alone (keeps a first run from flagging history). */
const NO_SHOW_LOOKBACK_DAYS = 3;
/** A booking at least this long is a term pass for renewal purposes. */
const TERM_MIN_LENGTH_DAYS = 20;

// postgres-js wants timestamps as strings in raw SQL.
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const ids = (rows: unknown) => (rows as { id: string }[]).map((r) => r.id);

/** Confirmed bookings starting soon that haven't been reminded. */
export async function claimReminders(db: Db, now = new Date()): Promise<string[]> {
  const until = new Date(now.getTime() + REMINDER_LOOKAHEAD_H * HOUR);
  return ids(
    await db.execute(sql`
      UPDATE booking b SET reminder_sent_at = ${ts(now)}
      FROM (
        SELECT r.booking_id, min(r.start_at) AS start_at
        FROM reservation r
        WHERE r.status = 'confirmed'
        GROUP BY r.booking_id
      ) s
      WHERE s.booking_id = b.id
        AND b.status = 'active'
        AND b.reminder_sent_at IS NULL
        AND s.start_at > ${ts(now)} AND s.start_at <= ${ts(until)}
        AND b.created_at < s.start_at - make_interval(hours => ${REMINDER_MIN_LEAD_H})
      RETURNING b.id`),
  );
}

/**
 * Short (≤ 1 day) confirmed bookings that have ended with no seat checked in.
 * Marks them and returns them for the "we missed you" email.
 */
export async function claimNoShows(db: Db, now = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - NO_SHOW_LOOKBACK_DAYS * DAY);
  return ids(
    await db.execute(sql`
      UPDATE booking b SET no_show_at = ${ts(now)}
      FROM (
        SELECT r.booking_id, min(r.start_at) AS start_at, max(r.end_at) AS end_at,
               bool_or(r.checked_in_at IS NOT NULL) AS came
        FROM reservation r
        WHERE r.status = 'confirmed'
        GROUP BY r.booking_id
      ) s
      WHERE s.booking_id = b.id
        AND b.status = 'active'
        AND b.no_show_at IS NULL
        AND NOT s.came
        AND s.end_at <= ${ts(now)} AND s.end_at > ${ts(since)}
        AND s.end_at - s.start_at <= make_interval(hours => ${NO_SHOW_MAX_LENGTH_H})
      RETURNING b.id`),
  );
}

/**
 * Monthly and annual passes ending within the notice period, unless the same
 * customer has already booked something that starts around the end.
 */
export async function claimRenewals(db: Db, now = new Date()): Promise<string[]> {
  const until = new Date(now.getTime() + RENEWAL_NOTICE_DAYS * DAY);
  return ids(
    await db.execute(sql`
      UPDATE booking b SET renewal_reminder_sent_at = ${ts(now)}
      FROM (
        SELECT r.booking_id, min(r.start_at) AS start_at, max(r.end_at) AS end_at
        FROM reservation r
        WHERE r.status = 'confirmed'
        GROUP BY r.booking_id
      ) s
      WHERE s.booking_id = b.id
        AND b.status = 'active'
        AND b.renewal_reminder_sent_at IS NULL
        AND s.end_at > ${ts(now)} AND s.end_at <= ${ts(until)}
        AND s.end_at - s.start_at >= make_interval(days => ${TERM_MIN_LENGTH_DAYS})
        AND NOT EXISTS (
          SELECT 1 FROM booking nb JOIN reservation nr ON nr.booking_id = nb.id
          WHERE nb.id <> b.id AND nb.status = 'active' AND nr.status = 'confirmed'
            AND (nb.customer_email = b.customer_email OR (b.member_id IS NOT NULL AND nb.member_id = b.member_id))
            AND nr.start_at >= s.end_at - interval '1 day'
            AND nr.end_at - nr.start_at >= make_interval(days => ${TERM_MIN_LENGTH_DAYS})
        )
      RETURNING b.id`),
  );
}
