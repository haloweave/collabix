import Link from "next/link";
import { Plus, TrendingUp, CalendarCheck, IndianRupee, UserCheck } from "lucide-react";
import {
  getDashboardStats,
  getHereToday,
  getTodayVisitors,
} from "@/lib/admin/queries";
import { rupees } from "@/lib/admin/format";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/stat-card";
import { ReceptionBoard } from "@/components/admin/reception-board";

export const dynamic = "force-dynamic";

export default async function StaffHome() {
  const [stats, here, visitors] = await Promise.all([
    getDashboardStats(),
    getHereToday(),
    getTodayVisitors(),
  ]);
  const onSite = here.filter((h) => h.checkedIn && !h.checkedOut).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Front desk</h1>
          <p className="text-sm text-muted-foreground">
            Check people in, sign visitors, and book on the spot.
          </p>
        </div>
        <Button asChild>
          <Link href="/staff/book">
            <Plus className="size-4" />
            New booking
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="On site now" value={String(onSite)} hint="Checked in, not out" icon={UserCheck} />
        <StatCard title="Bookings today" value={String(stats.bookingsToday)} hint="Confirmed" icon={CalendarCheck} />
        <StatCard title="Occupancy" value={`${stats.occupancyPct}%`} hint={`${stats.seatsBookedToday}/${stats.totalResources} seats`} icon={TrendingUp} />
        <StatCard title="Revenue today" value={rupees(stats.revenueTodayMinor)} hint="Confirmed" icon={IndianRupee} />
      </div>

      <ReceptionBoard here={here} visitors={visitors} />
    </div>
  );
}
