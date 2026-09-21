import Link from "next/link";
import type { HereTodayRow, VisitorRow } from "@/lib/admin/queries";
import { istTime } from "@/lib/admin/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckInControls } from "@/components/admin/check-in-controls";
import {
  VisitorSignIn,
  VisitorSignOutButton,
} from "@/components/admin/visitor-panel";

// Shared front-desk board: today's check-in/out list + visitor log. Used by
// both /admin/reception and the standalone /staff console.
export function ReceptionBoard({
  here,
  visitors,
}: {
  here: HereTodayRow[];
  visitors: VisitorRow[];
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Here today</CardTitle>
          <CardDescription>Check members in and out at the desk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {here.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No bookings scheduled for today.
            </p>
          )}
          {here.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="font-medium hover:underline"
                >
                  {b.customerName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {istTime(b.startAt)}–{istTime(b.endAt)} · {b.plan ?? "—"} ·{" "}
                  {b.seats} seat{b.seats === 1 ? "" : "s"}
                  {b.checkedInAt ? ` · in at ${istTime(b.checkedInAt)}` : ""}
                </p>
              </div>
              <CheckInControls
                bookingId={b.id}
                checkedIn={b.checkedIn}
                checkedOut={b.checkedOut}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visitors</CardTitle>
          <CardDescription>Guest sign-in log for today.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <VisitorSignIn />
          <div className="space-y-2">
            {visitors.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No visitors signed in today.
              </p>
            )}
            {visitors.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {v.name}
                    {v.company ? (
                      <span className="text-muted-foreground"> · {v.company}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    in at {istTime(v.checkedInAt)}
                    {v.host ? ` · visiting ${v.host}` : ""}
                    {v.checkedOutAt ? ` · out at ${istTime(v.checkedOutAt)}` : ""}
                  </p>
                </div>
                <VisitorSignOutButton id={v.id} signedOut={!!v.checkedOutAt} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
