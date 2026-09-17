import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { confirmBooking } from "@/lib/domain/reservations";
import { confirmBody } from "@/lib/api/validation";

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
  return NextResponse.json({ ok: true });
}
