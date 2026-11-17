import "server-only";
import { sql } from "@/lib/db/client";
import { bookingStage, relativeDay, type BookingStage } from "./booking-stage";

const n = (v: unknown) => Number(v ?? 0);

export type MyBooking = {
  id: string;
  stage: BookingStage;
  /** "Today", "Tomorrow", "In 3 days"… relative to the query's `now`. */
  startsIn: string;
  startAt: Date;
  endAt: Date;
  seats: number;
  plan: string | null;
  /** Rate-plan registry key, for the seat wording (lib/domain/ticket-display). */
  planKey: string | null;
  resourceCodes: string[];
  totalMinor: number;
  cancellable: boolean;
  ticketToken: string | null;
  ticketCode: string | null;
  /** Set once confirmed: the tax invoice can be downloaded. */
  invoiceNo: string | null;
  /** Settled online through Cashfree. */
  paid: boolean;
  /** Refund progress after a paid booking was cancelled: due | pending | refunded | failed. */
  refundStatus: string | null;
  /** Ended without a check-in (flagged by the daily job). */
  noShow: boolean;
};

/**
 * A customer's bookings (by linked member id or captured email), soonest
 * first. Abandoned checkouts are left out (see bookingStage).
 */
export async function getMyBookings(
  userId: string,
  email: string,
  now = new Date(),
): Promise<MyBooking[]> {
  const rows = await sql`
    SELECT b.id, b.status, b.no_show_at, b.ticket_token, b.ticket_code, b.invoice_no,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      count(r.id)::int AS seats,
      array_agg(res.code ORDER BY res.code) AS codes,
      string_agg(DISTINCT rp.name, ' + ') AS plan,
      (array_agg(DISTINCT rp.key))[1] AS plan_key,
      (array_agg(r.quote_snapshot->>'totalMinor'))[1]::bigint AS total_minor,
      bool_or(r.status = 'confirmed') AS confirmed,
      bool_or(r.status = 'held' AND r.hold_expires_at > now()) AS pending,
      EXISTS (SELECT 1 FROM payment p WHERE p.booking_id = b.id AND p.status = 'paid') AS paid,
      (SELECT p.refund_status FROM payment p WHERE p.booking_id = b.id AND p.status = 'paid'
        ORDER BY p.paid_at DESC LIMIT 1) AS refund_status
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id
    JOIN resource res ON res.id = r.resource_id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE b.member_id = ${userId} OR b.customer_email = ${email}
    GROUP BY b.id
    ORDER BY min(r.start_at)`;

  const out: MyBooking[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const startAt = new Date(r.start_at as string);
    const endAt = new Date(r.end_at as string);
    const stage = bookingStage(
      {
        status: r.status as "active" | "cancelled",
        confirmed: Boolean(r.confirmed),
        ticketed: r.ticket_token != null,
        pending: Boolean(r.pending),
        startAt,
        endAt,
      },
      now,
    );
    if (!stage) continue;
    out.push({
      id: r.id as string,
      stage,
      startsIn: relativeDay(startAt, now),
      startAt,
      endAt,
      seats: n(r.seats),
      plan: (r.plan as string) ?? null,
      planKey: (r.plan_key as string) ?? null,
      resourceCodes: Array.isArray(r.codes) ? (r.codes as string[]) : [],
      totalMinor: n(r.total_minor),
      cancellable: stage === "upcoming" || stage === "today",
      ticketToken: (r.ticket_token as string) ?? null,
      ticketCode: (r.ticket_code as string) ?? null,
      invoiceNo: (r.invoice_no as string) ?? null,
      paid: Boolean(r.paid),
      refundStatus: (r.refund_status as string) ?? null,
      noShow: r.no_show_at != null,
    });
  }
  return out;
}
