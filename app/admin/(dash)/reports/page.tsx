import { Suspense } from "react";
import { Download } from "lucide-react";
import { requireManager } from "@/lib/admin/auth";
import { getReportSummary } from "@/lib/admin/queries";
import { rupees } from "@/lib/admin/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/admin/skeletons";

export const dynamic = "force-dynamic";

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireManager();
  const sp = await searchParams;
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const from = isDate(sp.from) ? sp.from! : `${today.slice(0, 7)}-01`;
  const to = isDate(sp.to) ? sp.to! : today;

  const exportHref = `/admin/reports/export?from=${from}&to=${to}`;
  // The header, date filter and export link don't need the query — only the
  // summary cards and per-plan table do, so those stream in behind a skeleton.
  const reportPromise = getReportSummary(from, to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Confirmed revenue and occupancy by session date.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={exportHref}>
            <Download className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      <form
        action="/admin/reports"
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      >
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      <Suspense fallback={<ReportSummarySkeleton />}>
        <ReportSummary dataPromise={reportPromise} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>By space type</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<TableSkeleton rows={4} cols={3} />}>
            <ReportByPlan dataPromise={reportPromise} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportSummarySkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function ReportSummary({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getReportSummary>;
}) {
  const report = await dataPromise;
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <Card>
        <CardHeader className="px-3 pb-1 pt-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
            Revenue
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 text-base font-semibold tabular-nums sm:p-6 sm:pt-0 sm:text-2xl">
          {rupees(report.totalRevenueMinor)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="px-3 pb-1 pt-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
            Bookings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 text-base font-semibold tabular-nums sm:p-6 sm:pt-0 sm:text-2xl">
          {report.totalBookings}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="px-3 pb-1 pt-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
            Seats booked
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 text-base font-semibold tabular-nums sm:p-6 sm:pt-0 sm:text-2xl">
          {report.totalSeats}
        </CardContent>
      </Card>
    </div>
  );
}

async function ReportByPlan({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getReportSummary>;
}) {
  const report = await dataPromise;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Plan</TableHead>
          <TableHead className="text-center">Bookings</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.byPlan.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={3}
              className="py-8 text-center text-sm text-muted-foreground"
            >
              No confirmed bookings in this range.
            </TableCell>
          </TableRow>
        )}
        {report.byPlan.map((p) => (
          <TableRow key={p.plan}>
            <TableCell className="font-medium">{p.plan}</TableCell>
            <TableCell className="text-center">{p.bookings}</TableCell>
            <TableCell className="text-right font-medium">
              {rupees(p.revenueMinor)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
