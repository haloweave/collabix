import "server-only";
import { db } from "@/lib/db/client";
import { rupees } from "@/lib/admin/format";
import { getTicketView, type TicketView } from "@/lib/domain/ticket-view";
import { ticketSeats, ticketWhen, VENUE_ADDRESS } from "@/lib/domain/ticket-display";
import { sendEmail } from "@/lib/email";
import { brandedEmailHtml, brandedEmailText, type EmailBody } from "@/lib/email-template";
import { siteUrl, ticketUrl } from "@/lib/ticket-qr";

// Customer emails about a booking after it was confirmed: cancellations,
// refunds, reminders and missed visits. The confirmation itself (with the QR
// ticket) lives in lib/ticket-email.ts.

const PHONE = "+91 96327 71444";

async function send(v: TicketView, subject: string, body: Omit<EmailBody, "footer">) {
  const full = { ...body, footer: VENUE_ADDRESS };
  await sendEmail({
    to: v.customerEmail,
    subject: `${subject} · Collabix`,
    text: brandedEmailText({ ...full, greeting: `Hi ${v.customerName},` }),
    html: brandedEmailHtml(full),
  });
}

const bookingRows = (v: TicketView): [string, string][] => [
  ["Plan", v.plan ?? "Booking"],
  ["Seats", ticketSeats(v)],
  ["When", ticketWhen(v)],
  ["Ticket code", v.code],
];

/** Swallow and log: a failed email must never undo the action that sent it. */
async function safely(what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[email] ${what} failed`, e);
  }
}

/**
 * The booking was cancelled. `refundMinor` is set when it had been paid; the
 * refund itself follows separately (sendRefundEmail).
 */
export async function sendCancellationEmail(
  bookingId: string,
  opts: { byStaff: boolean; refundMinor?: number | null },
): Promise<void> {
  await safely("cancellation", async () => {
    const v = await getTicketView(db, { bookingId });
    if (!v) return; // never confirmed: nothing was promised, nothing to say
    const refund = opts.refundMinor
      ? `You paid ${rupees(opts.refundMinor)}. Our team will be in touch about your refund; you'll get another email once it's on its way.`
      : undefined;
    await send(v, "Booking cancelled", {
      heading: "Booking cancelled",
      intro: opts.byStaff
        ? "Our front desk has cancelled your booking below and your ticket no longer works."
        : "As you asked, your booking below is cancelled and your ticket no longer works.",
      details: bookingRows(v),
      outro: [refund, `Questions? Call us on ${PHONE}.`].filter(Boolean).join(" "),
    });
  });
}

/** The money is on its way back (or was handed back at the desk). */
export async function sendRefundEmail(
  bookingId: string,
  opts: { amountMinor: number; online: boolean; settled: boolean },
): Promise<void> {
  await safely("refund", async () => {
    const v = await getTicketView(db, { bookingId });
    if (!v) return;
    await send(v, opts.settled ? "Refund completed" : "Refund started", {
      heading: opts.settled ? "Your refund is complete" : "Your refund is on its way",
      intro: opts.online
        ? opts.settled
          ? `We've refunded ${rupees(opts.amountMinor)} to the account you paid from.`
          : `We've started a refund of ${rupees(opts.amountMinor)} to the account you paid from. Banks usually take 5–7 working days to show it.`
        : `We've refunded ${rupees(opts.amountMinor)} for your cancelled booking.`,
      details: bookingRows(v),
      outro: `Questions? Call us on ${PHONE}.`,
    });
  });
}

/** Sent the day before (or a few hours before) a confirmed booking starts. */
export async function sendReminderEmail(bookingId: string): Promise<void> {
  await safely("reminder", async () => {
    const v = await getTicketView(db, { bookingId });
    if (!v || v.status !== "active" || !v.confirmed) return;
    await send(v, `Reminder: ${ticketWhen(v)}`, {
      heading: "See you soon",
      intro: "A quick reminder of your upcoming booking at Collabix. Show your ticket QR at reception to check in.",
      details: bookingRows(v),
      cta: { label: "View ticket", url: ticketUrl(v.token) },
      outro: `Can't make it? Cancel from your account, or call us on ${PHONE}, so someone else can use the space.`,
    });
  });
}

/** The booking ended without a check-in. */
export async function sendNoShowEmail(bookingId: string): Promise<void> {
  await safely("no-show", async () => {
    const v = await getTicketView(db, { bookingId });
    if (!v) return;
    await send(v, "We missed you", {
      heading: "We missed you today",
      intro: "Your booking below ended without a check-in at reception, so we've marked it as a no-show.",
      details: bookingRows(v),
      outro: `If you did come in, or something went wrong, call us on ${PHONE} and we'll sort it out.`,
    });
  });
}

/** A monthly or annual pass ends soon. */
export async function sendRenewalReminderEmail(bookingId: string): Promise<void> {
  await safely("renewal", async () => {
    const v = await getTicketView(db, { bookingId });
    if (!v || v.status !== "active" || !v.confirmed) return;
    await send(v, "Your pass ends soon", {
      heading: "Your pass ends soon",
      intro: `Your ${v.plan ?? "pass"} runs until ${ticketWhen(v).split(" – ").pop()}. Renew now to keep your desk.`,
      details: bookingRows(v),
      cta: { label: "Renew your pass", url: `${siteUrl()}/book/passes` },
      outro: `Questions about renewing? Call us on ${PHONE}.`,
    });
  });
}
