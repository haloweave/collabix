import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { holdTerm } from "@/lib/domain/reservations";
import { termHoldBody } from "@/lib/api/validation";

// Hold a desk or cabin for a monthly or annual pass. Payment and confirmation
// then go through /api/bookings/pay and /api/bookings/confirm like any booking.
export async function POST(req: Request) {
  const parsed = termHoldBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await holdTerm(db, parsed.data);
  if (!result.ok) {
    const status = result.error === "seat_unavailable" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    bookingId: result.bookingId,
    reservationIds: result.reservationIds,
    holdExpiresAt: result.holdExpiresAt,
    quote: result.quote,
  });
}
