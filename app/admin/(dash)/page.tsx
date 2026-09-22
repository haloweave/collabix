import { Suspense } from "react";
import Link from "next/link";
import {
  Armchair,
  Clock,
  CalendarCheck,
  IndianRupee,
  TrendingUp,
} from "lucide-react";
import {
  getDashboardStats,
  getUpcomingBookings,
  getDailySeries,
} from "@/lib/admin/queries";
import { rupees, istDateTime } from "@/lib/admin/format";
import { StatCard } from "@/components/admin/stat-card";
import { DashboardCharts } from "@/components/admin/dashboard-charts";
import {
  ChartSkeleton,
  StatGridSkeleton,
  StatCardSkeleton,
} from "@/components/admin/skeletons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Today&apos;s occupancy and revenue at a glance.
        </p>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <StatGridSkeleton count={4} />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <ChartSkeleton />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-1.5 h-3 w-64" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function DashboardBody() {
  const [stats, upcoming, series] = await Promise.all([
    getDashboardStats(),
    getUpcomingBookings(),
    getDailySeries(),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
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

      <DashboardCharts data={series} />

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
