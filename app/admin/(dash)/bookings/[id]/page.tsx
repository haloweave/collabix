import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getBooking } from "@/lib/admin/queries";
import { rupees, istDateTime, istDate } from "@/lib/admin/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { CancelBookingButton } from "@/components/admin/cancel-booking-button";

export const dynamic = "force-dynamic";

const RES_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  confirmed: "default",
  held: "secondary",
  expired: "outline",
  cancelled: "destructive",
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  // Every reservation carries the same booking-wide quote; use the first.
  const quote = booking.reservations[0]?.quote;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/bookings" aria-label="Back to bookings">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {booking.customerName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {booking.customerEmail} · booked {istDate(booking.createdAt)}
            </p>
          </div>
        </div>
        {booking.status === "active" && (
          <CancelBookingButton bookingId={booking.id} />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Booking status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {booking.status === "cancelled" ? (
              <Badge variant="destructive">Cancelled</Badge>
            ) : (
              <Badge>Active</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {booking.memberId ? "Linked member" : "Guest checkout"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {quote ? rupees(quote.totalMinor) : "—"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reservations</CardTitle>
          <CardDescription>
            {booking.reservations.length} seat
            {booking.reservations.length === 1 ? "" : "s"} in this booking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seat</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.reservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell className="text-sm">{r.plan}</TableCell>
                  <TableCell className="text-sm">{istDateTime(r.startAt)}</TableCell>
                  <TableCell className="text-sm">{istDateTime(r.endAt)}</TableCell>
                  <TableCell>
                    <Badge variant={RES_VARIANT[r.status] ?? "outline"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {quote && (
        <Card>
          <CardHeader>
            <CardTitle>Price breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Subtotal ({quote.hours}h × {quote.seats} seat
                {quote.seats === 1 ? "" : "s"})
              </span>
              <span>{rupees(quote.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{rupees(quote.taxMinor)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Total</span>
              <span>{rupees(quote.totalMinor)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
