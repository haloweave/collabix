import "server-only";
import { db } from "@/lib/db/client";
import { istDate } from "@/lib/admin/format";
import { getTicketView } from "@/lib/domain/ticket-view";
import { ticketAmount, ticketSeats, ticketWhen, VENUE_ADDRESS } from "@/lib/domain/ticket-display";
import { sendEmail } from "@/lib/email";
import { ticketQrPng, ticketUrl } from "@/lib/ticket-qr";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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

  const text = [
    `Hi ${v.customerName},`,
    "",
    "Your Collabix booking is confirmed. Show the QR code at reception to check in.",
    "",
    ...details.map(([k, val]) => `${k}: ${val}`),
    "",
    `Your ticket: ${url}`,
    "",
    "Collabix Work Lounge",
    VENUE_ADDRESS,
  ].join("\n");

  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0B1F3A">
  <div style="background:#0B1F3A;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0">
    <div style="color:#C89B53;font-size:12px;letter-spacing:.2em;text-transform:uppercase">Collabix Work Lounge</div>
    <div style="font-size:20px;font-weight:600;margin-top:4px">You're booked in</div>
  </div>
  <div style="border:1px solid #D9D6D1;border-top:0;border-radius:0 0 16px 16px;padding:24px;text-align:center">
    <p style="margin:0 0 16px">Hi ${esc(v.customerName)}, show this QR at reception to check in.</p>
    <img src="cid:ticket-qr" width="220" height="220" alt="Ticket QR code" style="display:block;margin:0 auto" />
    <div style="font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.15em;margin:8px 0 20px">${esc(v.code)}</div>
    <table style="width:100%;font-size:14px;text-align:left;border-collapse:collapse">
      ${details.map(([k, val]) => `<tr><td style="color:#4A4F58;padding:4px 0">${esc(k)}</td><td style="text-align:right;font-weight:600">${esc(val)}</td></tr>`).join("")}
    </table>
    <a href="${esc(url)}" style="display:inline-block;margin-top:20px;background:#C89B53;color:#0B1F3A;padding:12px 20px;border-radius:999px;font-weight:600;text-decoration:none">View ticket</a>
    <p style="font-size:12px;color:#4A4F58;margin-top:20px">${esc(VENUE_ADDRESS)}</p>
  </div>
</div>`;

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
