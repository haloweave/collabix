import Link from "next/link";
import { requireMember } from "@/lib/account/auth";
import { getMyBookings } from "@/lib/account/queries";
import { rupees, istDateTime } from "@/lib/admin/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CancelMyBooking } from "@/components/account/cancel-my-booking";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage() {
  const member = await requireMember();
  const bookings = await getMyBookings(member.id, member.email);
  const upcoming = bookings.filter((b) => b.cancellable || (b.confirmed && b.status === "active" && b.startAt && b.startAt > new Date()));
  const past = bookings.filter((b) => !upcoming.includes(b));

  function Row({ b }: { b: (typeof bookings)[number] }) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <p className="font-medium">
            {b.plan ?? "Booking"}{" "}
            <span className="font-normal text-muted-foreground">
              · {b.seats} seat{b.seats === 1 ? "" : "s"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {b.startAt ? istDateTime(b.startAt) : "—"} · {rupees(b.totalMinor)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {b.status === "cancelled" ? (
            <Badge variant="destructive">Cancelled</Badge>
          ) : (
            <Badge>Confirmed</Badge>
          )}
          {b.cancellable && <CancelMyBooking bookingId={b.id} />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
        <Button asChild>
          <Link href="/home/booking">Book again</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
          )}
          {upcoming.map((b) => (
            <Row key={b.id} b={b} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past & cancelled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {past.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          )}
          {past.map((b) => (
            <Row key={b.id} b={b} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
