import { NextResponse, after } from "next/server";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { confirmBody } from "@/lib/api/validation";
import { payFromWallet } from "@/lib/domain/wallet";
import { sendTicketEmail } from "@/lib/ticket-email";

// Pay a held booking from the signed-in customer's wallet. Charging and
// confirming happen in one transaction, so a seat that can't be confirmed is
// never charged. Only the session's own wallet can be spent.
export async function POST(req: Request) {
  const parsed = confirmBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = await payFromWallet(db, { bookingId: parsed.data.bookingId, userId: session.user.id, by: "member" });
  if (!res.ok) {
    const status = res.error === "not_found" ? 404 : res.error === "insufficient_funds" ? 402 : 409;
    return NextResponse.json({ error: res.error }, { status });
  }
  after(async () => {
    try {
      await sendTicketEmail(parsed.data.bookingId);
    } catch (e) {
      console.error("[ticket-email] send failed", e);
    }
  });
  return NextResponse.json({ ok: true, ticketToken: res.ticketToken, balanceMinor: res.balanceMinor });
}
