import "server-only";
import { db } from "@/lib/db/client";
import { istDate } from "@/lib/admin/format";
import { getTicketView } from "@/lib/domain/ticket-view";
import { ticketAmount, ticketSeats, ticketWhen, VENUE_ADDRESS } from "@/lib/domain/ticket-display";
import { sendEmail } from "@/lib/email";
import { brandedEmailHtml, brandedEmailText, esc } from "@/lib/email-template";
import { ticketQrPng, ticketUrl } from "@/lib/ticket-qr";

// Booking confirmation with the e-ticket. The QR is a CID-referenced PNG
// attachment because Gmail strips inline SVG and data: URIs.
export async function sendTicketEmail(bookingId: string): Promise<void> {
  const v = await getTicketView(db, { bookingId });
  if (!v || v.status !== "active" || !v.confirmed) return;

  const url = ticketUrl(v.token);
  const details: [string, string][] = [
    ["Plan", v.plan ?? "Booking"],
    ["Seats", ticketSeats(v)],
    ["When", ticketWhen(v)],
    ["Amount", ticketAmount(v)],
    ["Ticket code", v.code],
  ];

  const body = {
    heading: "You're booked in",
    intro: "Your Collabix booking is confirmed. Show the QR code at reception to check in.",
    extraHtml: `<img src="cid:ticket-qr" width="220" height="220" alt="Ticket QR code" style="display:block;margin:0 auto" />
    <div style="font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.15em;margin:8px 0 20px">${esc(v.code)}</div>`,
    details,
    cta: { label: "View ticket", url },
    footer: VENUE_ADDRESS,
  };
  const text = brandedEmailText({ ...body, greeting: `Hi ${v.customerName},`, cta: { label: "Your ticket", url } });
  const html = brandedEmailHtml({ ...body, intro: `Hi ${v.customerName}, show this QR at reception to check in.` });

  await sendEmail({
    to: v.customerEmail,
    subject: `Booking confirmed · ${istDate(v.startAt)} · Collabix`,
    text,
    html,
    attachments: [
      { filename: "collabix-ticket.png", content: await ticketQrPng(v.token), contentType: "image/png", cid: "ticket-qr" },
    ],
  });
}
