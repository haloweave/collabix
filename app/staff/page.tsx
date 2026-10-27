import { Suspense } from "react";
import Link from "next/link";
import { Plus, TrendingUp, CalendarCheck, IndianRupee, UserCheck, ScanLine } from "lucide-react";
import {
  getDashboardStats,
  getHereToday,
  getTodayVisitors,
} from "@/lib/admin/queries";
import { rupees } from "@/lib/admin/format";
import { StatCard } from "@/components/admin/stat-card";
import { WelcomeBand } from "@/components/admin/welcome-band";
import { ReceptionBoard } from "@/components/admin/reception-board";
import { StatGridSkeleton, CardSkeleton } from "@/components/admin/skeletons";

export const dynamic = "force-dynamic";

export default function StaffHome() {
  return (
    <div className="space-y-6">
      <WelcomeBand
        eyebrow={new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  })}
        title="Front desk"
        subtitle="Check people in, sign visitors, and book on the spot."
      >
        <Link href="/staff/book" className="inline-flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy shadow-[0_6px_20px_rgba(200,155,83,0.28)] transition hover:-translate-y-0.5 hover:bg-gold-light">
          <Plus className="size-4" /> New booking
        </Link>
        <Link href="/staff/scan" className="inline-flex items-center gap-2 rounded-md border border-ivory/25 px-4 py-2 text-sm font-medium text-ivory transition hover:border-gold hover:text-white">
          <ScanLine className="size-4" /> Scan ticket
        </Link>
      </WelcomeBand>

      <Suspense
        fallback={
          <div className="space-y-6">
            <StatGridSkeleton count={4} />
            <CardSkeleton lines={4} />
          </div>
        }
      >
        <StaffHomeBody />
      </Suspense>

      <Link
        href="/staff/scan"
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-gold px-5 py-3 font-semibold text-navy shadow-[0_8px_22px_rgba(200,155,83,0.44)] md:hidden"
      >
        <ScanLine className="size-5" /> Scan
      </Link>
    </div>
  );
}

async function StaffHomeBody() {
  const [stats, here, visitors] = await Promise.all([
    getDashboardStats(),
    getHereToday(),
    getTodayVisitors(),
  ]);
  const onSite = here.filter((h) => h.checkedIn && !h.checkedOut).length;

  return (
    <div className="space-y-6">
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
