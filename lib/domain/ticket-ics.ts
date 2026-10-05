// Calendar (.ics) file for a ticket. The event UID is derived from the ticket
// token — never the booking id, which must not leave the server (spec §4).

import { VENUE_ADDRESS } from "./ticket-display";
import type { TicketView } from "./ticket-view";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

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
    `SUMMARY:${esc(`Collabix · ${view.plan ?? "Booking"} (${view.resourceCodes.join(", ")})`)}`,
    `LOCATION:${esc(VENUE_ADDRESS)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
