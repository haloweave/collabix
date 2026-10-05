import { NextResponse, after } from "next/server";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { confirmBooking } from "@/lib/domain/reservations";
import { confirmBody } from "@/lib/api/validation";
import { sendTicketEmail } from "@/lib/ticket-email";

// Confirm a held reservation. If the guest verified an OTP during checkout,
// they now have a session — attach the booking to that member (BookMyShow-style
// lazy account). No payment gate in this slice.
export async function POST(req: Request) {
  const parsed = confirmBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const session = await auth.api.getSession({ headers: req.headers });
  const memberId = session?.user?.id ?? parsed.data.memberId;

  const result = await confirmBooking(db, {
    bookingId: parsed.data.bookingId,
    memberId,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  // Email the ticket after responding, so SMTP latency never slows checkout
  // and an email failure never fails the booking. Only on the confirmation
  // itself — a repeat call must not re-send it.
  if (result.newlyConfirmed) {
    after(async () => {
      try {
        await sendTicketEmail(parsed.data.bookingId);
      } catch (e) {
        console.error("[ticket-email] send failed", e);
      }
    });
  }
  return NextResponse.json({ ok: true, ticketToken: result.ticketToken });
}
