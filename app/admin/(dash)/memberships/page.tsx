import Link from "next/link";
import { BadgeCheck, CalendarClock, Hourglass } from "lucide-react";
import { requireManager } from "@/lib/admin/auth";
import { listMemberships, type MembershipRow, type MembershipStatus } from "@/lib/admin/queries";
import { MembershipTable } from "@/components/admin/membership-table";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const FILTERS: { key: MembershipStatus | "all"; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "upcoming", label: "Starts soon" },
  { key: "ended", label: "Ended" },
  { key: "all", label: "All" },
];

const EMPTY: Record<MembershipStatus | "all", string> = {
  active: "No active memberships.",
  upcoming: "No memberships starting soon.",
  ended: "No ended memberships.",
  all: "No memberships yet. They appear here when someone buys a monthly or annual pass.",
};

function summarize(rows: MembershipRow[]) {
  const in30Days = Date.now() + 30 * 86_400_000;
  const active = rows.filter((m) => m.status === "active");
  return {
    active: active.length,
    endingSoon: active.filter((m) => m.endAt.getTime() <= in30Days).length,
    upcoming: rows.filter((m) => m.status === "upcoming").length,
  };
}

// Memberships are the monthly and annual passes sold on /book/passes: each one
// holds a desk or cabin for its whole term.
export default async function MembershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireManager();
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.status)?.key ?? "active";
  const all = await listMemberships();
  const rows = filter === "all" ? all : all.filter((m) => m.status === filter);

  const { active, endingSoon, upcoming } = summarize(all);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memberships</h1>
        <p className="text-sm text-muted-foreground">
          Monthly and annual passes. Each one holds a desk or cabin for its whole term.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Active" value={String(active)} hint="Members on a pass today" icon={BadgeCheck} />
        <StatCard title="Ending in 30 days" value={String(endingSoon)} hint="Due for renewal" icon={Hourglass} />
        <StatCard title="Starts soon" value={String(upcoming)} hint="Paid, not started yet" icon={CalendarClock} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} asChild size="sm" variant={f.key === filter ? "default" : "outline"}>
            <Link href={f.key === "active" ? "/admin/memberships" : `/admin/memberships?status=${f.key}`}>
              {f.label}
            </Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <MembershipTable rows={rows} empty={EMPTY[filter]} />
        </CardContent>
      </Card>
    </div>
  );
}
