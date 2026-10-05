// Read model for an e-ticket: one row per booking with everything the guest
// page, the staff scan card and the confirmation email show. Stamps come from
// confirmed reservations only (a staff check-in stamps them all together).

import { sql } from "drizzle-orm";
import type { Db } from "./reservations";
import type { TicketBooking, TicketLookup } from "./ticket";

export type TicketView = {
  bookingId: string;
  status: "active" | "cancelled";
  confirmed: boolean;
  customerName: string;
  /** For the confirmation email only — never rendered on the public page. */
  customerEmail: string;
  token: string;
  code: string;
  startAt: Date;
  endAt: Date;
  seats: number;
  resourceCodes: string[];
  plan: string | null;
  /** null for membership holds, which carry no price. */
  totalMinor: number | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
};

export type TicketKey = TicketLookup | { bookingId: string };

const date = (v: unknown) => (v == null ? null : new Date(v as string));

export async function getTicketView(db: Db, key: TicketKey): Promise<TicketView | null> {
  const where =
    "token" in key
      ? sql`b.ticket_token = ${key.token}`
      : "code" in key
        ? sql`b.ticket_code = ${key.code}`
        : sql`b.id = ${key.bookingId}`;

  const rows = (await db.execute(sql`
    SELECT b.id, b.status, b.customer_name, b.customer_email,
      b.ticket_token, b.ticket_code,
      bool_or(r.status = 'confirmed') AS confirmed,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      count(r.id)::int AS seats,
      array_agg(res.code ORDER BY res.code) AS codes,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot ->> 'totalMinor'))[1] AS total_minor,
      max(r.checked_in_at) FILTER (WHERE r.status = 'confirmed') AS checked_in_at,
      CASE WHEN bool_and(r.checked_out_at IS NOT NULL) FILTER (WHERE r.status = 'confirmed')
        THEN max(r.checked_out_at) FILTER (WHERE r.status = 'confirmed')
      END AS checked_out_at
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id AND r.status IN ('confirmed', 'cancelled')
    JOIN resource res ON res.id = r.resource_id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE ${where} AND b.ticket_token IS NOT NULL
    GROUP BY b.id`)) as unknown as Record<string, unknown>[];

  const r = rows[0];
  if (!r) return null;
  return {
    bookingId: r.id as string,
    status: r.status as "active" | "cancelled",
    confirmed: Boolean(r.confirmed),
    customerName: r.customer_name as string,
    customerEmail: r.customer_email as string,
    token: r.ticket_token as string,
    code: r.ticket_code as string,
    startAt: new Date(r.start_at as string),
    endAt: new Date(r.end_at as string),
    seats: Number(r.seats),
    resourceCodes: Array.isArray(r.codes) ? (r.codes as string[]) : [],
    plan: (r.plan as string | null) ?? null,
    totalMinor: r.total_minor == null ? null : Number(r.total_minor),
    checkedInAt: date(r.checked_in_at),
    checkedOutAt: date(r.checked_out_at),
  };
}

export function toTicketBooking(
  v: TicketView,
  hours: { openHour: number; closeHour: number },
): TicketBooking {
  return {
    status: v.status,
    confirmed: v.confirmed,
    startAt: v.startAt,
    endAt: v.endAt,
    checkedInAt: v.checkedInAt,
    checkedOutAt: v.checkedOutAt,
    openHour: hours.openHour,
    closeHour: hours.closeHour,
  };
}
