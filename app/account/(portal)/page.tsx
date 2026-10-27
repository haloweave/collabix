import Link from "next/link";
import { requireMember } from "@/lib/account/auth";
import { getMyBookings } from "@/lib/account/queries";
import { BookingCard, NextVisit } from "@/components/account/booking-card";

export const dynamic = "force-dynamic";

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.16em] !text-navy/50">
        {title}
        <span className="font-mono text-gold">{count}</span>
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export default async function MyBookingsPage() {
  const member = await requireMember();
  const bookings = await getMyBookings(member.id, member.email);

  const live = bookings.filter((b) => b.stage === "today" || b.stage === "upcoming" || b.stage === "in-progress");
  const next = live[0];
  const comingUp = [
    ...bookings.filter((b) => b.stage === "awaiting-payment"),
    ...live.slice(1),
  ];
  const history = bookings
    .filter((b) => b.stage === "completed" || b.stage === "cancelled")
    .reverse();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">My bookings</h1>
          <p className="text-sm text-navy/60">Tickets, invoices and everything you have booked.</p>
        </div>
        <Link href="/book" className="btn btn-gold">
          Book again <span className="arw">→</span>
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-navy/20 bg-white/60 px-6 py-12 text-center">
          <p className="text-lg font-semibold text-navy">No bookings yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-navy/60">
            Grab a day pass or a meeting room and it will show up here, with your
            ticket and invoice.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/book" className="btn btn-gold">
              Book a desk <span className="arw">→</span>
            </Link>
            <Link href="/pricing" className="btn btn-ghost">
              See pricing
            </Link>
          </div>
        </div>
      ) : (
        <>
          {next ? (
            <NextVisit b={next} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy/10 bg-white px-5 py-4">
              <p className="text-sm text-navy/70">Nothing coming up. Your next desk is a couple of taps away.</p>
              <Link href="/book" className="text-sm font-semibold text-navy underline decoration-gold underline-offset-4">
                Book a visit
              </Link>
            </div>
          )}

          {comingUp.length > 0 && (
            <Section title="Coming up" count={comingUp.length}>
              {comingUp.map((b) => (
                <BookingCard key={b.id} b={b} />
              ))}
            </Section>
          )}

          {history.length > 0 && (
            <Section title="History" count={history.length}>
              {history.map((b) => (
                <BookingCard key={b.id} b={b} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
