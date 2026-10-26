import { NextResponse, after } from "next/server";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { confirmBooking } from "@/lib/domain/reservations";
import { settleLatestForBooking } from "@/lib/domain/payments";
import { confirmBody } from "@/lib/api/validation";
import { sendTicketEmail } from "@/lib/ticket-email";
import { getCashfreeGateway, paymentsDisabled } from "@/lib/payments/cashfree";

// Confirm a held booking. Public bookings are paid online: this settles the
// booking's latest Cashfree order and confirms only when it is PAID — the
// browser's say-so is never enough. PAYMENTS_DISABLED (dev only) restores the
// old pay-at-desk confirmation.
export async function POST(req: Request) {
  const parsed = confirmBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { bookingId } = parsed.data;

  if (paymentsDisabled()) {
    // If the guest verified an OTP during checkout they now have a session —
    // attach the booking to that member (BookMyShow-style lazy account).
    const session = await auth.api.getSession({ headers: req.headers });
    const memberId = session?.user?.id ?? parsed.data.memberId;
    const result = await confirmBooking(db, { bookingId, memberId });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }
    if (result.newlyConfirmed) emailTicketLater(bookingId);
    return NextResponse.json({ ok: true, ticketToken: result.ticketToken });
  }

  const gw = getCashfreeGateway();
  if (!gw) return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });

  let settled;
  try {
    settled = await settleLatestForBooking(db, gw, bookingId);
  } catch (e) {
    // Cashfree unreachable: the order may well be paid, so tell the client to
    // keep asking rather than declare a failure to someone who just paid.
    console.error("[cashfree] settle failed", e);
    return NextResponse.json({ error: "gateway_error" }, { status: 503 });
  }
  if (!settled.ok) {
    const status = settled.error === "not_found" ? 404 : 402;
    return NextResponse.json({ error: settled.error }, { status });
  }
  switch (settled.status) {
    case "paid":
      if (settled.newlyConfirmed) emailTicketLater(bookingId);
      return NextResponse.json({ ok: true, ticketToken: settled.ticketToken });
    case "pending":
      return NextResponse.json({ error: "payment_pending" }, { status: 402 });
    case "refund_due":
      return NextResponse.json({ error: "seat_lost" }, { status: 409 });
    default:
      return NextResponse.json({ error: "payment_failed" }, { status: 402 });
  }
}

// Email the ticket after responding, so SMTP latency never slows checkout and
// an email failure never fails the booking. Only on the confirmation itself.
function emailTicketLater(bookingId: string) {
  after(async () => {
    try {
      await sendTicketEmail(bookingId);
    } catch (e) {
      console.error("[ticket-email] send failed", e);
    }
  });
}
