import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDaySchedule } from "@/lib/admin/queries";
import { OPEN_HOUR, CLOSE_HOUR } from "@/lib/domain/booking";
import { TextSkeleton } from "@/components/admin/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

const SPAN = CLOSE_HOUR - OPEN_HOUR;
const HOURS = Array.from({ length: SPAN + 1 }, (_, i) => OPEN_HOUR + i);

function shiftDay(dateStr: string, delta: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function prettyDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const clampPct = (h: number) =>
  ((Math.min(CLOSE_HOUR, Math.max(OPEN_HOUR, h)) - OPEN_HOUR) / SPAN) * 100;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;

  // The date navigation renders instantly; the schedule query streams in.
  const schedulePromise = getDaySchedule(date);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {prettyDate(date)} ·{" "}
            <Suspense fallback={<TextSkeleton className="w-28" />}>
              <CalendarSummary dataPromise={schedulePromise} />
            </Suspense>{" "}
            · {OPEN_HOUR}:00–{CLOSE_HOUR}:00
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link
              href={`/admin/calendar?date=${shiftDay(date, -1)}`}
              aria-label="Previous day"
            >
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <form action="/admin/calendar">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
          </form>
          <Button variant="outline" size="icon" asChild>
            <Link
              href={`/admin/calendar?date=${shiftDay(date, 1)}`}
              aria-label="Next day"
            >
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={<CalendarGridSkeleton />}>
        <CalendarGrid dataPromise={schedulePromise} />
      </Suspense>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-primary" /> Confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-primary/40 bg-secondary" />{" "}
          Held
        </span>
      </div>
    </div>
  );
}

async function CalendarSummary({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getDaySchedule>;
}) {
  const rows = await dataPromise;
  const booked = rows.filter((r) => r.blocks.length > 0).length;
  return (
    <>
      {booked} of {rows.length} seats in use
    </>
  );
}

function CalendarGridSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-7 w-14 shrink-0" />
            <Skeleton className="h-7 flex-1" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

async function CalendarGrid({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof getDaySchedule>;
}) {
  const rows = await dataPromise;

  return (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <div className="min-w-[640px]">
          {/* Hour ruler */}
          <div className="mb-2 flex">
            <div className="sticky left-0 z-10 w-14 shrink-0 bg-card" />
            <div className="relative flex-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                {HOURS.map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.resourceId} className="flex items-center">
                <div className="sticky left-0 z-10 w-14 shrink-0 bg-card pr-1 text-xs font-medium">
                  {row.code}
                </div>
                <div className="relative h-7 flex-1 rounded bg-muted/60">
                  {row.blocks.map((b) => {
                    const left = clampPct(b.startHour);
                    const width = clampPct(b.endHour) - left;
                    if (width <= 0) return null;
                    const confirmed = b.status === "confirmed";
                    return (
                      <Link
                        key={b.reservationId}
                        href={`/admin/bookings/${b.bookingId}`}
                        title={`${b.customerName} · ${b.status}`}
                        className={`absolute inset-y-0 flex items-center overflow-hidden rounded px-1.5 text-[10px] font-medium ${
                          confirmed
                            ? "bg-primary text-primary-foreground"
                            : "border border-primary/40 bg-secondary text-secondary-foreground"
                        }`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span className="truncate">{b.customerName}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
