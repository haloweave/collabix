import Link from "next/link";
import {
  Armchair,
  Clock,
  CalendarCheck,
  IndianRupee,
  TrendingUp,
} from "lucide-react";
import { getDashboardStats, getUpcomingBookings } from "@/lib/admin/queries";
import { rupees, istDateTime } from "@/lib/admin/format";
import { StatCard } from "@/components/admin/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, upcoming] = await Promise.all([
    getDashboardStats(),
    getUpcomingBookings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Today&apos;s occupancy and revenue at a glance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Occupancy today"
          value={`${stats.occupancyPct}%`}
          hint={`${stats.seatsBookedToday} of ${stats.totalResources} seats booked`}
          icon={TrendingUp}
        />
        <StatCard
          title="Bookings today"
          value={String(stats.bookingsToday)}
          hint="Confirmed for today"
          icon={CalendarCheck}
        />
        <StatCard
          title="Active holds"
          value={String(stats.activeHolds)}
          hint="Seats held, awaiting confirmation"
          icon={Clock}
        />
        <StatCard
          title="Seats booked"
          value={String(stats.seatsBookedToday)}
          hint="Distinct seats in use today"
          icon={Armchair}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatCard
          title="Revenue · today"
          value={rupees(stats.revenueTodayMinor)}
          hint="Confirmed sessions starting today"
          icon={IndianRupee}
        />
        <StatCard
          title="Revenue · this month"
          value={rupees(stats.revenueMonthMinor)}
          hint="Confirmed sessions this calendar month"
          icon={IndianRupee}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming bookings</CardTitle>
          <CardDescription>
            The next confirmed sessions across the lounge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming confirmed bookings.
            </p>
          )}
          {upcoming.map((b) => (
            <Link
              key={b.id}
              href={`/admin/bookings/${b.id}`}
              className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{b.customerName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {b.startAt ? istDateTime(b.startAt) : "—"} ·{" "}
                  {b.plan ?? "—"} · {b.seats} seat{b.seats === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-3 pl-3">
                <span className="text-sm font-medium">
                  {rupees(b.totalMinor)}
                </span>
                <Badge variant="secondary">Confirmed</Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
