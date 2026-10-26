import { NextResponse, after } from "next/server";
import { db } from "@/lib/db/client";
import { markPaymentFailed, settlePayment } from "@/lib/domain/payments";
import { getCashfreeGateway, verifyWebhookSignature } from "@/lib/payments/cashfree";
import { sendTicketEmail } from "@/lib/ticket-email";

// Cashfree's server-to-server notification. The backstop for a guest whose
// connection dropped after paying: a PAID order settles here exactly as it
// would from the browser, and settlement is idempotent so both may run.
// Signature is checked over the raw body — never a re-serialised one.
export async function POST(req: Request) {
  const secret = process.env.CASHFREE_SECRET_KEY;
  const gw = getCashfreeGateway();
  if (!secret || !gw) return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
  if (!verifyWebhookSignature(secret, signature, timestamp, raw)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { order?: { order_id?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const orderId = event.data?.order?.order_id;
  if (!orderId) return NextResponse.json({ ok: true, ignored: "no_order_id" });

  switch (event.type) {
    case "PAYMENT_SUCCESS_WEBHOOK": {
      const settled = await settlePayment(db, gw, { orderId });
      if (settled.ok && settled.status === "paid" && settled.newlyConfirmed) {
        const bookingId = settled.bookingId;
        after(async () => {
          try {
            await sendTicketEmail(bookingId);
          } catch (e) {
            console.error("[ticket-email] send failed", e);
          }
        });
      }
      if (!settled.ok) console.warn("[cashfree-webhook] unknown order", orderId);
      return NextResponse.json({ ok: true, result: settled.ok ? settled.status : settled.error });
    }
    case "PAYMENT_FAILED_WEBHOOK":
      await markPaymentFailed(db, orderId);
      return NextResponse.json({ ok: true, result: "failed" });
    default:
      return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }
}
