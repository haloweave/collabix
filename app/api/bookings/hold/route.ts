import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { holdReservation } from "@/lib/domain/reservations";
import { holdBody } from "@/lib/api/validation";

export async function POST(req: Request) {
  const parsed = holdBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await holdReservation(db, parsed.data);
  if (!result.ok) {
    const status = result.error === "seat_unavailable" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    reservationId: result.reservationId,
    bookingId: result.bookingId,
    holdExpiresAt: result.holdExpiresAt,
    quote: result.quote,
  });
}
