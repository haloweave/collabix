"use client";

import { CalendarX, CheckCircle2, Clock, LogOut, UserCheck, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { istDate, istTime } from "@/lib/admin/format";
import { EARLY_CHECKIN_MIN } from "@/lib/domain/ticket";
import { ticketAmount, ticketSeats, ticketWhen } from "@/lib/domain/ticket-display";
import type { ScanOutcome } from "@/lib/domain/scan";

type Head = { tone: string; Icon: LucideIcon; title: string; action?: "checkout" | "override" };

const TONE = {
  green: "bg-emerald-600",
  blue: "bg-sky-600",
  grey: "bg-slate-500",
  amber: "bg-amber-500",
  red: "bg-red-600",
};

function headline(o: ScanOutcome): Head {
  if (o.kind === "invalid") return { tone: TONE.red, Icon: XCircle, title: "Not a valid Collabix ticket" };
  const { state, view, justCheckedIn } = o;
  if (state.phase === "cancelled") return { tone: TONE.red, Icon: XCircle, title: "Cancelled booking" };
  if (state.phase === "not_confirmed") return { tone: TONE.red, Icon: XCircle, title: "Booking not confirmed" };
  if (justCheckedIn) return { tone: TONE.green, Icon: CheckCircle2, title: "Verified · Checked in" };
  if (state.checkedOutAt) return { tone: TONE.grey, Icon: LogOut, title: `Checked out at ${istTime(state.checkedOutAt)}` };
  if (state.checkedInAt)
    return { tone: TONE.blue, Icon: UserCheck, title: `Already checked in at ${istTime(state.checkedInAt)}`, action: "checkout" };
  if (state.phase === "too_early") {
    const starts = state.multiDay
      ? new Date(state.windowStart.getTime() + EARLY_CHECKIN_MIN * 60_000)
      : view.startAt;
    return { tone: TONE.amber, Icon: Clock, title: `Too early — starts ${istTime(starts)}`, action: "override" };
  }
  if (state.phase === "other_day")
    return { tone: TONE.amber, Icon: CalendarX, title: `${state.multiDay ? "Booked from" : "Booked for"} ${istDate(view.startAt)}` };
  if (state.phase === "ended") return { tone: TONE.amber, Icon: Clock, title: `Ended at ${istTime(state.windowEnd)}` };
  return { tone: TONE.green, Icon: CheckCircle2, title: "Verified" };
}

export function ScanResultCard({
  outcome,
  busy,
  onCheckOut,
  onOverride,
  onNext,
  nextLabel = "Scan next",
}: {
  outcome: ScanOutcome;
  busy: boolean;
  onCheckOut: () => void;
  onOverride: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  const h = headline(outcome);
  return (
    <div className="flex min-h-full flex-col bg-background">
      <div className={`${h.tone} flex flex-col items-center gap-3 px-6 py-10 text-center text-white`} role="status" aria-live="assertive">
        <h.Icon className="size-16" aria-hidden />
        <p className="text-2xl font-semibold leading-tight">{h.title}</p>
      </div>

      {outcome.kind === "ticket" && (
        <dl className="grid gap-4 p-6 text-base">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Guest</dt>
            <dd className="text-2xl font-semibold">{outcome.view.customerName}</dd>
          </div>
          <Item label="Plan" value={outcome.view.plan ?? "Booking"} />
          <Item label="Seats" value={ticketSeats(outcome.view)} mono />
          <Item label="When" value={ticketWhen(outcome.view)} />
          <Item label="Amount" value={ticketAmount(outcome.view)} />
          <Item label="Ticket" value={outcome.view.code} mono />
        </dl>
      )}

      <div className="mt-auto grid gap-3 p-6">
        {h.action === "checkout" && (
          <Button size="lg" variant="outline" disabled={busy} onClick={onCheckOut}>Check out</Button>
        )}
        {h.action === "override" && (
          <Button size="lg" variant="outline" disabled={busy} onClick={onOverride}>Check in anyway</Button>
        )}
        <Button size="lg" disabled={busy} onClick={onNext}>{nextLabel}</Button>
      </div>
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
