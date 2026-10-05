import { CalendarPlus, MapPin } from "lucide-react";
import { istTime } from "@/lib/admin/format";
import type { TicketState } from "@/lib/domain/ticket";
import type { TicketView } from "@/lib/domain/ticket-view";
import { ticketAmount, ticketSeats, ticketWhen, VENUE_ADDRESS, VENUE_MAPS_URL } from "@/lib/domain/ticket-display";

function banner(state: TicketState) {
  if (state.phase === "cancelled") return { cls: "bg-red-600", text: "Cancelled" };
  if (state.phase === "not_confirmed") return { cls: "bg-amber-500", text: "Not confirmed" };
  if (state.checkedOutAt) return { cls: "bg-slate-500", text: `Checked out at ${istTime(state.checkedOutAt)}` };
  if (state.checkedInAt) return { cls: "bg-emerald-600", text: `Checked in at ${istTime(state.checkedInAt)}` };
  if (state.phase === "ended") return { cls: "bg-slate-500", text: state.multiDay ? "Done for today" : "Booking ended" };
  return { cls: "bg-emerald-600", text: "Confirmed · show this at reception" };
}

export function TicketPass({ view, state, qrSvg }: { view: TicketView; state: TicketState; qrSvg: string }) {
  const b = banner(state);
  const live = state.phase !== "cancelled" && state.phase !== "not_confirmed";
  return (
    <article className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
      <header className="bg-navy px-6 py-5 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Collabix Work Lounge</p>
        <h1 className="mt-1 text-xl font-semibold">{view.plan ?? "Booking"}</h1>
      </header>
      <div className={`${b.cls} px-6 py-2 text-center text-sm font-medium text-white`} role="status">
        {b.text}
      </div>

      {live && (
        <div className="flex flex-col items-center px-6 pt-6">
          <div
            className="w-56 [&>svg]:h-auto [&>svg]:w-full"
            aria-label="Ticket QR code"
            role="img"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 font-mono text-lg tracking-widest text-navy">{view.code}</p>
        </div>
      )}

      <div className="relative my-5 border-t border-dashed border-[#D9D6D1]">
        <span className="absolute -left-3 -top-3 size-6 rounded-full bg-[#F7F5F2]" />
        <span className="absolute -right-3 -top-3 size-6 rounded-full bg-[#F7F5F2]" />
      </div>

      <dl className="grid gap-3 px-6 pb-6 text-sm">
        <Row label="Guest" value={view.customerName} />
        <Row label="When" value={ticketWhen(view)} />
        <Row label="Seats" value={ticketSeats(view)} mono />
        <Row label="Amount" value={ticketAmount(view)} />
      </dl>

      <footer className="flex gap-2 border-t bg-[#F7F5F2] px-6 py-4 text-sm">
        <a href={VENUE_MAPS_URL} target="_blank" rel="noopener noreferrer"
           className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-white py-2 font-medium text-navy">
          <MapPin className="size-4" /> Directions
        </a>
        {live && (
          <a href={`/t/${view.token}/ics`}
             className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-white py-2 font-medium text-navy">
            <CalendarPlus className="size-4" /> Add to calendar
          </a>
        )}
      </footer>
      <p className="px-6 pb-5 text-center text-xs text-[#4A4F58]">{VENUE_ADDRESS}</p>
    </article>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs uppercase tracking-wider text-[#4A4F58]">{label}</dt>
      <dd className={`text-right font-medium text-navy ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
