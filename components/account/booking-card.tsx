import Link from "next/link";
import { CalendarPlus, Download, MapPin, Ticket } from "lucide-react";
import type { MyBooking } from "@/lib/account/queries";
import type { BookingStage } from "@/lib/account/booking-stage";
import { rupees } from "@/lib/admin/format";
import { ticketSeats, ticketWhen, VENUE_MAPS_URL } from "@/lib/domain/ticket-display";
import { CancelMyBooking } from "@/components/account/cancel-my-booking";
import { cn } from "@/lib/utils";

const IST = "Asia/Kolkata";
const part = (d: Date, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { ...o, timeZone: IST }).format(d);

const STAGE: Record<BookingStage, { label: string; className: string }> = {
  "awaiting-payment": { label: "Awaiting payment", className: "bg-amber-100 text-amber-900" },
  today: { label: "Today", className: "bg-gold/20 text-navy" },
  "in-progress": { label: "Happening now", className: "bg-emerald-100 text-emerald-900" },
  upcoming: { label: "Upcoming", className: "bg-navy/[0.07] text-navy" },
  completed: { label: "Completed", className: "bg-navy/[0.05] text-navy/60" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700" },
};

const live = (s: BookingStage) => s === "upcoming" || s === "today" || s === "in-progress";

export const bookingTitle = (b: MyBooking) => b.plan ?? "Booking";

/** The seat wording, unless it only repeats the title (rooms), plus a separator. */
const seatsLine = (b: MyBooking) => (ticketSeats(b) === bookingTitle(b) ? "" : `${ticketSeats(b)} · `);

export function bookingAmount(b: MyBooking): string {
  return `${rupees(b.totalMinor)} · ${b.paid ? "Paid" : "Pay at desk"}`;
}

export const invoiceHref = (id: string) => `/account/invoices/${id}`;

export function StageChip({ stage }: { stage: BookingStage }) {
  const s = STAGE[stage];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", s.className)}>
      {s.label}
    </span>
  );
}

function ActionLink({
  href,
  icon: Icon,
  children,
  download,
  external,
}: {
  href: string;
  icon: typeof Ticket;
  children: React.ReactNode;
  download?: boolean;
  external?: boolean;
}) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-navy/[0.06]";
  const body = (
    <>
      <Icon className="size-4 text-gold" aria-hidden />
      {children}
    </>
  );
  // Downloads and files skip client-side navigation.
  if (download || external)
    return (
      <a href={href} className={cls} {...(download ? { download: true } : { target: "_blank", rel: "noopener noreferrer" })}>
        {body}
      </a>
    );
  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/** One row in the coming-up or history list. */
export function BookingCard({ b }: { b: MyBooking }) {
  const dim = b.stage === "completed" || b.stage === "cancelled";
  return (
    <article className="flex items-start gap-3.5 rounded-xl border border-navy/10 bg-white p-3.5 shadow-[0_1px_2px_rgba(11,31,58,0.04)] sm:items-center sm:gap-5 sm:p-4">
      <div
        className={cn(
          "flex w-14 shrink-0 flex-col items-center rounded-lg border py-1.5 text-center",
          dim ? "border-navy/10 text-navy/50" : "border-gold/40 text-navy",
        )}
        aria-hidden
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gold">
          {part(b.startAt, { month: "short" })}
        </span>
        <span className="text-xl font-semibold leading-tight">{part(b.startAt, { day: "numeric" })}</span>
        <span className="text-[10px] uppercase tracking-wide">{part(b.startAt, { weekday: "short" })}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={cn("font-semibold text-navy", b.stage === "cancelled" && "line-through decoration-navy/30")}>
              {bookingTitle(b)}
            </h3>
            <StageChip stage={b.stage} />
          </div>
          <p className="mt-0.5 text-sm text-navy/70">{ticketWhen(b)}</p>
          <p className="text-xs text-navy/50">
            {seatsLine(b)}
            {bookingAmount(b)}
            {b.ticketCode && <span className="font-mono"> · {b.ticketCode}</span>}
          </p>
        </div>

        <div className="-ml-2.5 flex flex-wrap items-center gap-0.5 sm:ml-0 sm:justify-end">
          {b.ticketToken && live(b.stage) && (
            <ActionLink href={`/t/${b.ticketToken}`} icon={Ticket}>
              Ticket
            </ActionLink>
          )}
          {b.invoiceNo && (
            <ActionLink href={invoiceHref(b.id)} icon={Download} download>
              Invoice
            </ActionLink>
          )}
          {b.cancellable && (
            <CancelMyBooking bookingId={b.id} summary={`${bookingTitle(b)} · ${ticketWhen(b)}`} />
          )}
        </div>
      </div>
    </article>
  );
}

/** The soonest live booking, given pride of place at the top of the page. */
export function NextVisit({ b }: { b: MyBooking }) {
  return (
    <section
      aria-label="Your next visit"
      className="relative overflow-hidden rounded-2xl bg-navy p-5 text-ivory shadow-[0_18px_40px_-18px_rgba(11,31,58,0.55)] sm:p-7"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-gold/15 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
              {b.stage === "in-progress" ? "Happening now" : "Your next visit"}
            </span>
            {b.stage !== "in-progress" && (
              <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-navy">{b.startsIn}</span>
            )}
          </div>
          <h2 className="!mt-2 text-2xl font-semibold tracking-tight !text-ivory sm:text-3xl">{bookingTitle(b)}</h2>
          <p className="mt-1 text-ivory/80">{ticketWhen(b)}</p>
          <p className="mt-1 text-sm text-ivory/60">
            {ticketSeats(b) === bookingTitle(b) ? "Private room" : ticketSeats(b)}
            {b.ticketCode && (
              <>
                {" · "}
                <span className="font-mono tracking-wide text-ivory/80">{b.ticketCode}</span>
              </>
            )}
          </p>
        </div>
        {b.ticketToken && (
          <Link href={`/t/${b.ticketToken}`} className="btn btn-gold shrink-0 self-start sm:self-auto">
            Open ticket <span className="arw">→</span>
          </Link>
        )}
      </div>

      <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t !border-ivory/10 pt-4 text-sm">
        {b.ticketToken && (
          <a href={`/t/${b.ticketToken}/ics`} className="inline-flex items-center gap-1.5 text-ivory/80 hover:text-gold">
            <CalendarPlus className="size-4" aria-hidden /> Add to calendar
          </a>
        )}
        <a
          href={VENUE_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-ivory/80 hover:text-gold"
        >
          <MapPin className="size-4" aria-hidden /> Directions
        </a>
        {b.invoiceNo && (
          <a href={invoiceHref(b.id)} download className="inline-flex items-center gap-1.5 text-ivory/80 hover:text-gold">
            <Download className="size-4" aria-hidden /> Invoice
          </a>
        )}
        {b.cancellable && (
          <span className="ml-auto [&_button]:text-ivory/60 [&_button:hover]:bg-transparent [&_button:hover]:text-red-300">
            <CancelMyBooking bookingId={b.id} summary={`${bookingTitle(b)} · ${ticketWhen(b)}`} />
          </span>
        )}
      </div>
    </section>
  );
}
