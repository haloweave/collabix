import "server-only";
import { sql } from "@/lib/db/client";
import type { Quote } from "@/lib/domain/booking";

// All admin reads live here as parameterised SQL. Money is integer paise; a
// booking's `quote_snapshot.totalMinor` is identical across its reservations and
// already covers every seat, so revenue is summed per-booking (DISTINCT ON /
// array_agg[1]) — never per reservation, which would multiply by seat count.

/**
 * IST day/month bounds for `now`, as UTC-instant ISO strings. postgres-js in
 * this setup rejects raw Date params, so we pass ISO text and cast to
 * timestamptz at the call site.
 */
function istBounds(now: Date) {
  const shifted = new Date(now.getTime() + 330 * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const dayStart = new Date(Date.UTC(y, m, d) - 330 * 60_000);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const monthStart = new Date(Date.UTC(y, m, 1) - 330 * 60_000);
  const monthEnd = new Date(Date.UTC(y, m + 1, 1) - 330 * 60_000);
  return {
    dayStart: dayStart.toISOString(),
    dayEnd: dayEnd.toISOString(),
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
  };
}

const n = (v: unknown) => Number(v ?? 0);

export type DashboardStats = {
  totalResources: number;
  seatsBookedToday: number;
  occupancyPct: number;
  activeHolds: number;
  bookingsToday: number;
  revenueTodayMinor: number;
  revenueMonthMinor: number;
};

export async function getDashboardStats(now = new Date()): Promise<DashboardStats> {
  const { dayStart, dayEnd, monthStart, monthEnd } = istBounds(now);

  const [
    totalRes,
    seatsToday,
    holds,
    bookingsToday,
    revToday,
    revMonth,
  ] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM resource WHERE enabled = true`,
    sql`SELECT count(DISTINCT r.resource_id)::int AS n FROM reservation r
        WHERE r.status = 'confirmed'
          AND r.start_at < ${dayEnd}::timestamptz AND r.end_at > ${dayStart}::timestamptz`,
    sql`SELECT count(*)::int AS n FROM reservation
        WHERE status = 'held' AND hold_expires_at > now()`,
    sql`SELECT count(DISTINCT r.booking_id)::int AS n FROM reservation r
        JOIN booking b ON b.id = r.booking_id
        WHERE r.status = 'confirmed' AND b.status = 'active'
          AND r.start_at >= ${dayStart}::timestamptz AND r.start_at < ${dayEnd}::timestamptz`,
    sql`SELECT COALESCE(SUM(t.total), 0)::bigint AS total FROM (
          SELECT DISTINCT ON (r.booking_id) (r.quote_snapshot->>'totalMinor')::bigint AS total
          FROM reservation r JOIN booking b ON b.id = r.booking_id
          WHERE r.status = 'confirmed' AND b.status = 'active'
            AND r.start_at >= ${dayStart}::timestamptz AND r.start_at < ${dayEnd}::timestamptz
          ORDER BY r.booking_id
        ) t`,
    sql`SELECT COALESCE(SUM(t.total), 0)::bigint AS total FROM (
          SELECT DISTINCT ON (r.booking_id) (r.quote_snapshot->>'totalMinor')::bigint AS total
          FROM reservation r JOIN booking b ON b.id = r.booking_id
          WHERE r.status = 'confirmed' AND b.status = 'active'
            AND r.start_at >= ${monthStart}::timestamptz AND r.start_at < ${monthEnd}::timestamptz
          ORDER BY r.booking_id
        ) t`,
  ]);

  const totalResources = n(totalRes[0]?.n);
  const seatsBookedToday = n(seatsToday[0]?.n);
  return {
    totalResources,
    seatsBookedToday,
    occupancyPct: totalResources
      ? Math.round((seatsBookedToday / totalResources) * 100)
      : 0,
    activeHolds: n(holds[0]?.n),
    bookingsToday: n(bookingsToday[0]?.n),
    revenueTodayMinor: n(revToday[0]?.total),
    revenueMonthMinor: n(revMonth[0]?.total),
  };
}

export type BookingRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  status: "active" | "cancelled";
  createdAt: Date;
  seats: number;
  startAt: Date | null;
  endAt: Date | null;
  plan: string | null;
  totalMinor: number;
  anyConfirmed: boolean;
  anyActiveHold: boolean;
};

function mapBookingRow(r: Record<string, unknown>): BookingRow {
  return {
    id: r.id as string,
    customerName: r.customer_name as string,
    customerEmail: r.customer_email as string,
    status: r.status as "active" | "cancelled",
    createdAt: new Date(r.created_at as string),
    seats: n(r.seats),
    startAt: r.start_at ? new Date(r.start_at as string) : null,
    endAt: r.end_at ? new Date(r.end_at as string) : null,
    plan: (r.plan as string) ?? null,
    totalMinor: n(r.total_minor),
    anyConfirmed: Boolean(r.any_confirmed),
    anyActiveHold: Boolean(r.any_active_hold),
  };
}

export async function listBookings(opts: {
  q?: string;
  status?: "all" | "active" | "cancelled";
}): Promise<BookingRow[]> {
  const q = (opts.q ?? "").trim();
  const like = `%${q}%`;
  const status = opts.status ?? "all";
  const rows = await sql`
    SELECT b.id, b.customer_name, b.customer_email, b.status, b.created_at,
      count(r.id)::int AS seats,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot->>'totalMinor'))[1]::bigint AS total_minor,
      bool_or(r.status = 'confirmed') AS any_confirmed,
      bool_or(r.status = 'held' AND r.hold_expires_at > now()) AS any_active_hold
    FROM booking b
    LEFT JOIN reservation r ON r.booking_id = b.id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE (${q} = '' OR b.customer_name ILIKE ${like} OR b.customer_email ILIKE ${like})
      AND (${status} = 'all' OR b.status::text = ${status})
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT 200`;
  return rows.map(mapBookingRow);
}

export async function getUpcomingBookings(): Promise<BookingRow[]> {
  const rows = await sql`
    SELECT b.id, b.customer_name, b.customer_email, b.status, b.created_at,
      count(r.id)::int AS seats,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot->>'totalMinor'))[1]::bigint AS total_minor,
      true AS any_confirmed,
      false AS any_active_hold
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id AND r.status = 'confirmed'
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE b.status = 'active' AND r.start_at >= now()
    GROUP BY b.id
    ORDER BY min(r.start_at) ASC
    LIMIT 8`;
  return rows.map(mapBookingRow);
}

export type BookingDetail = {
  id: string;
  customerName: string;
  customerEmail: string;
  memberId: string | null;
  status: "active" | "cancelled";
  createdAt: Date;
  reservations: {
    id: string;
    code: string;
    plan: string;
    status: "held" | "confirmed" | "expired" | "cancelled";
    startAt: Date;
    endAt: Date;
    holdExpiresAt: Date | null;
    quote: Quote;
  }[];
};

export async function getBooking(id: string): Promise<BookingDetail | null> {
  const [b] = await sql`SELECT * FROM booking WHERE id = ${id}`;
  if (!b) return null;
  const res = await sql`
    SELECT r.id, r.status, r.start_at, r.end_at, r.hold_expires_at,
           r.quote_snapshot, res.code, rp.name AS plan
    FROM reservation r
    JOIN resource res ON res.id = r.resource_id
    JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE r.booking_id = ${id}
    ORDER BY res.code`;
  return {
    id: b.id as string,
    customerName: b.customer_name as string,
    customerEmail: b.customer_email as string,
    memberId: (b.member_id as string) ?? null,
    status: b.status as "active" | "cancelled",
    createdAt: new Date(b.created_at as string),
    reservations: res.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      code: r.code as string,
      plan: r.plan as string,
      status: r.status as "held" | "confirmed" | "expired" | "cancelled",
      startAt: new Date(r.start_at as string),
      endAt: new Date(r.end_at as string),
      holdExpiresAt: r.hold_expires_at ? new Date(r.hold_expires_at as string) : null,
      quote: r.quote_snapshot as Quote,
    })),
  };
}

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  bookings: number;
};

export async function listMembers(q = ""): Promise<MemberRow[]> {
  const term = q.trim();
  const like = `%${term}%`;
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
      (SELECT count(*)::int FROM booking b
        WHERE b.member_id = u.id OR b.customer_email = u.email) AS bookings
    FROM "user" u
    WHERE (${term} = '' OR u.name ILIKE ${like} OR u.email ILIKE ${like})
    ORDER BY u.created_at DESC
    LIMIT 200`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    role: r.role as string,
    createdAt: new Date(r.created_at as string),
    bookings: n(r.bookings),
  }));
}

export type MemberDetail = {
  id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber: string | null;
  notes: string | null;
  createdAt: Date;
  bookings: BookingRow[];
};

export async function getMember(id: string): Promise<MemberDetail | null> {
  const [u] = await sql`SELECT * FROM "user" WHERE id = ${id}`;
  if (!u) return null;
  const rows = await sql`
    SELECT b.id, b.customer_name, b.customer_email, b.status, b.created_at,
      count(r.id)::int AS seats,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot->>'totalMinor'))[1]::bigint AS total_minor,
      bool_or(r.status = 'confirmed') AS any_confirmed,
      bool_or(r.status = 'held' AND r.hold_expires_at > now()) AS any_active_hold
    FROM booking b
    LEFT JOIN reservation r ON r.booking_id = b.id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE b.member_id = ${id} OR b.customer_email = ${u.email as string}
    GROUP BY b.id
    ORDER BY b.created_at DESC`;
  return {
    id: u.id as string,
    name: u.name as string,
    email: u.email as string,
    role: u.role as string,
    phoneNumber: (u.phone_number as string) ?? null,
    notes: (u.notes as string) ?? null,
    createdAt: new Date(u.created_at as string),
    bookings: rows.map(mapBookingRow),
  };
}

export type InventoryResource = {
  id: string;
  code: string;
  kind: "desk" | "room";
  capacity: number;
  enabled: boolean;
};
export type InventoryZone = {
  id: string;
  name: string;
  kind: string;
  resources: InventoryResource[];
};
export type InventoryFloor = {
  id: string;
  name: string;
  zones: InventoryZone[];
};

/** Full inventory grouped floor → zone → resource, ordered for display. */
export async function listInventory(): Promise<InventoryFloor[]> {
  const rows = await sql`
    SELECT f.id AS floor_id, f.name AS floor_name,
           z.id AS zone_id, z.name AS zone_name, z.kind AS zone_kind,
           r.id AS resource_id, r.code, r.kind, r.capacity, r.enabled
    FROM floor f
    JOIN zone z ON z.floor_id = f.id
    JOIN resource r ON r.zone_id = z.id
    ORDER BY f.name, z.name, r.code`;

  const floors: InventoryFloor[] = [];
  const floorById = new Map<string, InventoryFloor>();
  const zoneById = new Map<string, InventoryZone>();

  for (const r of rows as Record<string, unknown>[]) {
    const floorId = r.floor_id as string;
    let floor = floorById.get(floorId);
    if (!floor) {
      floor = { id: floorId, name: r.floor_name as string, zones: [] };
      floorById.set(floorId, floor);
      floors.push(floor);
    }
    const zoneId = r.zone_id as string;
    let zone = zoneById.get(zoneId);
    if (!zone) {
      zone = {
        id: zoneId,
        name: r.zone_name as string,
        kind: r.zone_kind as string,
        resources: [],
      };
      zoneById.set(zoneId, zone);
      floor.zones.push(zone);
    }
    zone.resources.push({
      id: r.resource_id as string,
      code: r.code as string,
      kind: r.kind as "desk" | "room",
      capacity: n(r.capacity),
      enabled: Boolean(r.enabled),
    });
  }
  return floors;
}

export type HereTodayRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  seats: number;
  startAt: Date;
  endAt: Date;
  plan: string | null;
  checkedIn: boolean;
  checkedOut: boolean;
  checkedInAt: Date | null;
};

/** Today's confirmed bookings for the reception check-in board. */
export async function getHereToday(now = new Date()): Promise<HereTodayRow[]> {
  const { dayStart, dayEnd } = istBounds(now);
  const rows = await sql`
    SELECT b.id, b.customer_name, b.customer_email,
      count(r.id)::int AS seats,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      bool_and(r.checked_in_at IS NOT NULL) AS checked_in,
      bool_and(r.checked_out_at IS NOT NULL) AS checked_out,
      min(r.checked_in_at) AS checked_in_at
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id AND r.status = 'confirmed'
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE b.status = 'active'
      AND r.start_at < ${dayEnd}::timestamptz AND r.end_at > ${dayStart}::timestamptz
    GROUP BY b.id
    ORDER BY min(r.start_at)`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    customerName: r.customer_name as string,
    customerEmail: r.customer_email as string,
    seats: n(r.seats),
    startAt: new Date(r.start_at as string),
    endAt: new Date(r.end_at as string),
    plan: (r.plan as string) ?? null,
    checkedIn: Boolean(r.checked_in),
    checkedOut: Boolean(r.checked_out),
    checkedInAt: r.checked_in_at ? new Date(r.checked_in_at as string) : null,
  }));
}

export type VisitorRow = {
  id: string;
  name: string;
  company: string | null;
  host: string | null;
  purpose: string | null;
  phone: string | null;
  checkedInAt: Date;
  checkedOutAt: Date | null;
};

/** Visitors signed in today, most recent first. */
export async function getTodayVisitors(now = new Date()): Promise<VisitorRow[]> {
  const { dayStart, dayEnd } = istBounds(now);
  const rows = await sql`
    SELECT id, name, company, host, purpose, phone, checked_in_at, checked_out_at
    FROM visitor
    WHERE checked_in_at >= ${dayStart}::timestamptz AND checked_in_at < ${dayEnd}::timestamptz
    ORDER BY checked_in_at DESC`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    company: (r.company as string) ?? null,
    host: (r.host as string) ?? null,
    purpose: (r.purpose as string) ?? null,
    phone: (r.phone as string) ?? null,
    checkedInAt: new Date(r.checked_in_at as string),
    checkedOutAt: r.checked_out_at ? new Date(r.checked_out_at as string) : null,
  }));
}

export type ScheduleBlock = {
  reservationId: string;
  bookingId: string;
  status: "held" | "confirmed";
  customerName: string;
  startHour: number; // IST hour-of-day (may be fractional), clamp at render
  endHour: number;
};
export type ScheduleRow = {
  resourceId: string;
  code: string;
  kind: "desk" | "room";
  blocks: ScheduleBlock[];
};

/** Per-resource timeline of held/confirmed reservations for one IST day. */
export async function getDaySchedule(dateStr: string): Promise<ScheduleRow[]> {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStartMs = Date.UTC(y, m - 1, d) - 330 * 60_000;
  const dayStart = new Date(dayStartMs).toISOString();
  const dayEnd = new Date(dayStartMs + 24 * 3_600_000).toISOString();

  const rows = await sql`
    SELECT r.id AS resource_id, r.code, r.kind,
      res.id AS reservation_id, res.status, res.start_at, res.end_at,
      b.id AS booking_id, b.customer_name
    FROM resource r
    LEFT JOIN reservation res ON res.resource_id = r.id
      AND res.status IN ('held', 'confirmed')
      AND res.start_at < ${dayEnd}::timestamptz AND res.end_at > ${dayStart}::timestamptz
    LEFT JOIN booking b ON b.id = res.booking_id
    WHERE r.enabled = true
    ORDER BY r.code, res.start_at`;

  const byResource = new Map<string, ScheduleRow>();
  const order: ScheduleRow[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const rid = r.resource_id as string;
    let row = byResource.get(rid);
    if (!row) {
      row = {
        resourceId: rid,
        code: r.code as string,
        kind: r.kind as "desk" | "room",
        blocks: [],
      };
      byResource.set(rid, row);
      order.push(row);
    }
    if (r.reservation_id) {
      const startMs = new Date(r.start_at as string).getTime();
      const endMs = new Date(r.end_at as string).getTime();
      row.blocks.push({
        reservationId: r.reservation_id as string,
        bookingId: r.booking_id as string,
        status: r.status as "held" | "confirmed",
        customerName: (r.customer_name as string) ?? "",
        startHour: (startMs - dayStartMs) / 3_600_000,
        endHour: (endMs - dayStartMs) / 3_600_000,
      });
    }
  }
  return order;
}

/** [from 00:00 IST, day-after-to 00:00 IST) as UTC-instant ISO strings. */
function istRangeIso(fromStr: string, toStr: string) {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd) - 330 * 60_000;
  const toEndMs = Date.UTC(ty, tm - 1, td + 1) - 330 * 60_000;
  return {
    from: new Date(fromMs).toISOString(),
    toEnd: new Date(toEndMs).toISOString(),
  };
}

export type ReportSummary = {
  from: string;
  to: string;
  totalRevenueMinor: number;
  totalBookings: number;
  totalSeats: number;
  byPlan: { plan: string; bookings: number; revenueMinor: number }[];
};

export async function getReportSummary(
  fromStr: string,
  toStr: string,
): Promise<ReportSummary> {
  const { from, toEnd } = istRangeIso(fromStr, toStr);

  const [byPlanRows, seatsRows] = await Promise.all([
    sql`SELECT plan, count(*)::int AS bookings, COALESCE(SUM(total), 0)::bigint AS revenue
        FROM (
          SELECT DISTINCT ON (r.booking_id) rp.name AS plan,
                 (r.quote_snapshot->>'totalMinor')::bigint AS total
          FROM reservation r
          JOIN booking b ON b.id = r.booking_id
          JOIN rate_plan rp ON rp.id = r.rate_plan_id
          WHERE r.status = 'confirmed' AND b.status = 'active'
            AND r.start_at >= ${from}::timestamptz AND r.start_at < ${toEnd}::timestamptz
          ORDER BY r.booking_id
        ) t
        GROUP BY plan ORDER BY revenue DESC`,
    sql`SELECT count(*)::int AS n FROM reservation r
        JOIN booking b ON b.id = r.booking_id
        WHERE r.status = 'confirmed' AND b.status = 'active'
          AND r.start_at >= ${from}::timestamptz AND r.start_at < ${toEnd}::timestamptz`,
  ]);

  const byPlan = byPlanRows.map((r: Record<string, unknown>) => ({
    plan: r.plan as string,
    bookings: n(r.bookings),
    revenueMinor: n(r.revenue),
  }));

  return {
    from: fromStr,
    to: toStr,
    totalRevenueMinor: byPlan.reduce((s, p) => s + p.revenueMinor, 0),
    totalBookings: byPlan.reduce((s, p) => s + p.bookings, 0),
    totalSeats: n(seatsRows[0]?.n),
    byPlan,
  };
}

export type ExportRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  plan: string | null;
  seats: number;
  startAt: Date | null;
  endAt: Date | null;
  totalMinor: number;
};

export async function getBookingsInRange(
  fromStr: string,
  toStr: string,
): Promise<ExportRow[]> {
  const { from, toEnd } = istRangeIso(fromStr, toStr);
  const rows = await sql`
    SELECT b.id, b.customer_name, b.customer_email,
      count(r.id)::int AS seats,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot->>'totalMinor'))[1]::bigint AS total_minor
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id AND r.status = 'confirmed'
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE b.status = 'active'
      AND r.start_at >= ${from}::timestamptz AND r.start_at < ${toEnd}::timestamptz
    GROUP BY b.id
    ORDER BY min(r.start_at)`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    customerName: r.customer_name as string,
    customerEmail: r.customer_email as string,
    plan: (r.plan as string) ?? null,
    seats: n(r.seats),
    startAt: r.start_at ? new Date(r.start_at as string) : null,
    endAt: r.end_at ? new Date(r.end_at as string) : null,
    totalMinor: n(r.total_minor),
  }));
}

export type MembershipPlanRow = {
  id: string;
  name: string;
  priceMinor: number;
  includedHours: number;
  overageRateMinor: number;
  active: boolean;
  subscribers: number;
};

export async function listMembershipPlans(): Promise<MembershipPlanRow[]> {
  const rows = await sql`
    SELECT mp.id, mp.name, mp.price_minor, mp.included_hours, mp.overage_rate_minor,
      mp.active,
      (SELECT count(*)::int FROM member_subscription s
        WHERE s.plan_id = mp.id AND s.status = 'active') AS subscribers
    FROM membership_plan mp ORDER BY mp.price_minor`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    priceMinor: n(r.price_minor),
    includedHours: n(r.included_hours),
    overageRateMinor: n(r.overage_rate_minor),
    active: Boolean(r.active),
    subscribers: n(r.subscribers),
  }));
}

export type SubscriptionRow = {
  id: string;
  memberId: string;
  memberName: string | null;
  memberEmail: string | null;
  planName: string;
  includedHours: number;
  hoursUsed: number;
  priceMinor: number;
  periodEnd: Date;
};

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const rows = await sql`
    SELECT s.id, s.member_id, u.name AS member_name, u.email AS member_email,
      mp.name AS plan_name, mp.included_hours, s.hours_used, mp.price_minor,
      s.period_end
    FROM member_subscription s
    JOIN membership_plan mp ON mp.id = s.plan_id
    LEFT JOIN "user" u ON u.id = s.member_id
    WHERE s.status = 'active'
    ORDER BY s.created_at DESC`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    memberId: r.member_id as string,
    memberName: (r.member_name as string) ?? null,
    memberEmail: (r.member_email as string) ?? null,
    planName: r.plan_name as string,
    includedHours: n(r.included_hours),
    hoursUsed: n(r.hours_used),
    priceMinor: n(r.price_minor),
    periodEnd: new Date(r.period_end as string),
  }));
}

export type MemberSubscription = {
  id: string;
  planId: string;
  planName: string;
  priceMinor: number;
  includedHours: number;
  overageRateMinor: number;
  hoursUsed: number; // computed live from bookings in the current period
  periodStart: Date;
  periodEnd: Date;
};

export async function getMemberSubscription(
  memberId: string,
): Promise<MemberSubscription | null> {
  const [s] = await sql`
    SELECT s.id, s.plan_id, mp.name AS plan_name, mp.price_minor,
      mp.included_hours, mp.overage_rate_minor, s.period_start, s.period_end,
      COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (r.end_at - r.start_at)) / 3600)
        FROM reservation r JOIN booking b ON b.id = r.booking_id
        WHERE b.member_id = s.member_id AND r.status = 'confirmed'
          AND (r.quote_snapshot->>'membershipHold') IS DISTINCT FROM 'true'
          AND r.start_at >= s.period_start AND r.start_at < s.period_end
      ), 0)::int AS hours_used
    FROM member_subscription s
    JOIN membership_plan mp ON mp.id = s.plan_id
    WHERE s.member_id = ${memberId} AND s.status = 'active'
    ORDER BY s.created_at DESC LIMIT 1`;
  if (!s) return null;
  return {
    id: s.id as string,
    planId: s.plan_id as string,
    planName: s.plan_name as string,
    priceMinor: n(s.price_minor),
    includedHours: n(s.included_hours),
    overageRateMinor: n(s.overage_rate_minor),
    hoursUsed: n(s.hours_used),
    periodStart: new Date(s.period_start as string),
    periodEnd: new Date(s.period_end as string),
  };
}

export type InvoiceRow = {
  id: string;
  memberId: string;
  memberName: string | null;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  lineItems: { label: string; amountMinor: number }[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidAt: Date | null;
  createdAt: Date;
};

function mapInvoice(r: Record<string, unknown>): InvoiceRow {
  return {
    id: r.id as string,
    memberId: r.member_id as string,
    memberName: (r.member_name as string) ?? null,
    status: r.status as string,
    periodStart: new Date(r.period_start as string),
    periodEnd: new Date(r.period_end as string),
    lineItems: (r.line_items as { label: string; amountMinor: number }[]) ?? [],
    subtotalMinor: n(r.subtotal_minor),
    taxMinor: n(r.tax_minor),
    totalMinor: n(r.total_minor),
    paidAt: r.paid_at ? new Date(r.paid_at as string) : null,
    createdAt: new Date(r.created_at as string),
  };
}

export async function listInvoices(): Promise<InvoiceRow[]> {
  const rows = await sql`
    SELECT i.*, u.name AS member_name
    FROM invoice i LEFT JOIN "user" u ON u.id = i.member_id
    ORDER BY i.created_at DESC LIMIT 200`;
  return rows.map(mapInvoice);
}

export async function getMemberInvoices(memberId: string): Promise<InvoiceRow[]> {
  const rows = await sql`
    SELECT i.*, NULL AS member_name FROM invoice i
    WHERE i.member_id = ${memberId} ORDER BY i.created_at DESC`;
  return rows.map(mapInvoice);
}

/** Active plans for the assignment dropdown. */
export async function listActivePlans(): Promise<
  { id: string; name: string; priceMinor: number; includedHours: number }[]
> {
  const rows = await sql`
    SELECT id, name, price_minor, included_hours FROM membership_plan
    WHERE active = true ORDER BY price_minor`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    priceMinor: n(r.price_minor),
    includedHours: n(r.included_hours),
  }));
}

export type HoldRow = {
  bookingId: string;
  startAt: Date;
  endAt: Date;
  codes: string[];
};

/** A member's active long-term holds (membershipHold reservations, not expired). */
export async function getMemberHolds(memberId: string): Promise<HoldRow[]> {
  const rows = await sql`
    SELECT b.id AS booking_id, min(r.start_at) AS start_at, max(r.end_at) AS end_at,
      array_agg(res.code ORDER BY res.code) AS codes
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id AND r.status = 'confirmed'
    JOIN resource res ON res.id = r.resource_id
    WHERE b.member_id = ${memberId} AND b.status = 'active'
      AND r.quote_snapshot->>'membershipHold' = 'true' AND r.end_at > now()
    GROUP BY b.id
    ORDER BY min(r.start_at)`;
  return rows.map((r: Record<string, unknown>) => ({
    bookingId: r.booking_id as string,
    startAt: new Date(r.start_at as string),
    endAt: new Date(r.end_at as string),
    codes: (r.codes as string[]) ?? [],
  }));
}

export type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
  createdAt: Date;
};

export async function listAuditEvents(): Promise<AuditRow[]> {
  const rows = await sql`
    SELECT id, actor_email, action, target_type, target_id, detail, created_at
    FROM audit_event ORDER BY created_at DESC LIMIT 200`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    actorEmail: r.actor_email as string,
    action: r.action as string,
    targetType: (r.target_type as string) ?? null,
    targetId: (r.target_id as string) ?? null,
    detail: r.detail ?? null,
    createdAt: new Date(r.created_at as string),
  }));
}

export type RatePlanRow = {
  id: string;
  key: string;
  name: string;
  appliesToKind: "desk" | "room";
  rateMinor: number;
  currency: string;
  active: boolean;
};

export async function listRatePlans(): Promise<RatePlanRow[]> {
  const rows = await sql`
    SELECT id, key, name, applies_to_kind, rate_minor, currency, active
    FROM rate_plan ORDER BY rate_minor ASC`;
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    key: r.key as string,
    name: r.name as string,
    appliesToKind: r.applies_to_kind as "desk" | "room",
    rateMinor: n(r.rate_minor),
    currency: r.currency as string,
    active: Boolean(r.active),
  }));
}
