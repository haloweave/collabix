// Calendar (.ics) file for a ticket. The event UID is derived from the ticket
// token — never the booking id, which must not leave the server (spec §4).

import { VENUE_ADDRESS, ticketSeats } from "./ticket-display";
import type { TicketView } from "./ticket-view";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

// "Full Day Pass · 2 people · Any shared desk", or just "The Boardroom" when the
// seat line already names the room — the same wording as the ticket itself.
function summary(view: TicketView): string {
  const where = ticketSeats(view);
  if (!view.plan) return where;
  return where === view.plan ? view.plan : `${view.plan} · ${where}`;
}

export function ticketIcs(view: TicketView, url: string, now = new Date()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Collabix//Ticket//EN",
    "BEGIN:VEVENT",
    `UID:${view.token}@collabix.co.in`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(view.startAt)}`,
    `DTEND:${stamp(view.endAt)}`,
    `SUMMARY:${esc(`Collabix · ${summary(view)}`)}`,
    `LOCATION:${esc(VENUE_ADDRESS)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
