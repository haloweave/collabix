import "server-only";
import { sql } from "@/lib/db/client";

const n = (v: unknown) => Number(v ?? 0);

export type MyBooking = {
  id: string;
  status: "active" | "cancelled";
  startAt: Date | null;
  endAt: Date | null;
  seats: number;
  plan: string | null;
  totalMinor: number;
  confirmed: boolean;
  cancellable: boolean;
};

/** A customer's bookings (by linked member id or captured email), newest first. */
export async function getMyBookings(
  userId: string,
  email: string,
): Promise<MyBooking[]> {
  const rows = await sql`
    SELECT b.id, b.status,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      count(r.id)::int AS seats,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot->>'totalMinor'))[1]::bigint AS total_minor,
      bool_or(r.status = 'confirmed') AS confirmed,
      (min(r.start_at) > now()) AS upcoming
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE b.member_id = ${userId} OR b.customer_email = ${email}
    GROUP BY b.id
    ORDER BY min(r.start_at) DESC`;
  return rows.map((r: Record<string, unknown>) => {
    const status = r.status as "active" | "cancelled";
    const confirmed = Boolean(r.confirmed);
    const upcoming = Boolean(r.upcoming);
    return {
      id: r.id as string,
      status,
      startAt: r.start_at ? new Date(r.start_at as string) : null,
      endAt: r.end_at ? new Date(r.end_at as string) : null,
      seats: n(r.seats),
      plan: (r.plan as string) ?? null,
      totalMinor: n(r.total_minor),
      confirmed,
      cancellable: status === "active" && confirmed && upcoming,
    };
  });
}
