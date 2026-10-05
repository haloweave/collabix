import { db } from "@/lib/db/client";
import { isTicketToken } from "@/lib/domain/ticket";
import { getTicketView } from "@/lib/domain/ticket-view";
import { VENUE_ADDRESS } from "@/lib/domain/ticket-display";
import { ticketUrl } from "@/lib/ticket-qr";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = isTicketToken(token) ? await getTicketView(db, { token }) : null;
  if (!view || view.status !== "active") return new Response("Not found", { status: 404 });

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Collabix//Ticket//EN",
    "BEGIN:VEVENT",
    `UID:${view.bookingId}@collabix.co.in`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(view.startAt)}`,
    `DTEND:${stamp(view.endAt)}`,
    `SUMMARY:${esc(`Collabix · ${view.plan ?? "Booking"} (${view.resourceCodes.join(", ")})`)}`,
    `LOCATION:${esc(VENUE_ADDRESS)}`,
    `URL:${ticketUrl(token)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="collabix-booking.ics"',
    },
  });
}
