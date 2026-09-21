import Link from "next/link";
import { Plus } from "lucide-react";
import { listBookings } from "@/lib/admin/queries";
import { rupees, istDateTime } from "@/lib/admin/format";
import { BookingsFilter } from "@/components/admin/bookings-filter";
import { BookingStatusBadge } from "@/components/admin/booking-status-badge";
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
  const bookings = await listBookings({ q, status });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            {bookings.length} booking{bookings.length === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""}.
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

      <div className="rounded-lg border">
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
    </div>
  );
}
