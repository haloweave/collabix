import { getBookingsInRange } from "@/lib/admin/queries";
import {
  getSessionUser,
  isAdminAuthDisabled,
  STAFF_ROLES,
} from "@/lib/admin/auth";

// Route handlers aren't covered by the (dash) layout guard, so authorise here.
async function authorised() {
  if (isAdminAuthDisabled()) return true;
  const u = await getSessionUser();
  return !!u && (STAFF_ROLES as readonly string[]).includes(u.role);
}

const isDate = (s: string | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  if (!(await authorised())) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = isDate(fromParam) ? fromParam : `${today.slice(0, 7)}-01`;
  const to = isDate(toParam) ? toParam : today;

  const rows = await getBookingsInRange(from, to);

  const header = [
    "booking_id",
    "customer_name",
    "customer_email",
    "plan",
    "seats",
    "start_at",
    "end_at",
    "total_inr",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.customerName,
        r.customerEmail,
        r.plan ?? "",
        r.seats,
        r.startAt ? r.startAt.toISOString() : "",
        r.endAt ? r.endAt.toISOString() : "",
        (r.totalMinor / 100).toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${from}_to_${to}.csv"`,
    },
  });
}
