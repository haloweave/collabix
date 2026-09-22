import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { listBookings } from "@/lib/admin/queries";
import { rupees, istDateTime } from "@/lib/admin/format";
import { BookingsFilter } from "@/components/admin/bookings-filter";
import { BookingStatusBadge } from "@/components/admin/booking-status-badge";
import { TableSkeleton, TextSkeleton } from "@/components/admin/skeletons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status =
    sp.status === "active" || sp.status === "cancelled" ? sp.status : "all";
  // Start the query but don't await it — the header, filter and action button
  // render instantly while the rows stream in. The same promise feeds the count
  // and the table, so the query still runs once.
  const bookingsPromise = listBookings({ q, status });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            <Suspense fallback={<TextSkeleton className="w-48" />}>
              <BookingsSummary dataPromise={bookingsPromise} q={q} />
            </Suspense>
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/bookings/new">
            <Plus className="size-4" />
            New booking
          </Link>
        </Button>
      </div>

      <BookingsFilter defaultQ={q} defaultStatus={status} />

      <Suspense fallback={<TableSkeleton rows={6} cols={6} />}>
        <BookingsRows dataPromise={bookingsPromise} />
      </Suspense>
    </div>
  );
}

async function BookingsSummary({
  dataPromise,
  q,
}: {
  dataPromise: ReturnType<typeof listBookings>;
  q: string;
}) {
  const bookings = await dataPromise;
  return (
    <>
      {bookings.length} booking{bookings.length === 1 ? "" : "s"}
      {q ? ` matching “${q}”` : ""}.
    </>
  );
}

async function BookingsRows({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof listBookings>;
}) {
  const bookings = await dataPromise;

  return (
    <>
      {/* Mobile: tappable card rows (tables overflow on narrow screens). */}
      <div className="divide-y overflow-hidden rounded-lg border md:hidden">
        {bookings.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No bookings found.
          </p>
        )}
        {bookings.map((b) => (
          <Link
            key={b.id}
            href={`/admin/bookings/${b.id}`}
            className="flex items-start justify-between gap-3 p-4 transition-colors active:bg-muted/60 hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{b.customerName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {b.customerEmail}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {b.startAt ? istDateTime(b.startAt) : "—"} · {b.plan ?? "—"} ·{" "}
                {b.seats} seat{b.seats === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-sm font-medium tabular-nums">
                {rupees(b.totalMinor)}
              </span>
              <BookingStatusBadge
                status={b.status}
                anyConfirmed={b.anyConfirmed}
                anyActiveHold={b.anyActiveHold}
              />
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-center">Seats</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No bookings found.
                </TableCell>
              </TableRow>
            )}
            {bookings.map((b) => (
              <TableRow
                key={b.id}
                className="cursor-pointer"
                // Row is a link target; the whole row navigates via the wrapper below.
              >
                <TableCell>
                  <Link href={`/admin/bookings/${b.id}`} className="block">
                    <span className="font-medium">{b.customerName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {b.customerEmail}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-sm">
                  <Link href={`/admin/bookings/${b.id}`} className="block">
                    {b.startAt ? istDateTime(b.startAt) : "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">
                  <Link href={`/admin/bookings/${b.id}`} className="block">
                    {b.plan ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-center text-sm">
                  <Link href={`/admin/bookings/${b.id}`} className="block">
                    {b.seats}
                  </Link>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  <Link href={`/admin/bookings/${b.id}`} className="block">
                    {rupees(b.totalMinor)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/bookings/${b.id}`} className="block">
                    <BookingStatusBadge
                      status={b.status}
                      anyConfirmed={b.anyConfirmed}
                      anyActiveHold={b.anyActiveHold}
                    />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
