import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { payBody } from "@/lib/api/validation";
import { beginPayment } from "@/lib/domain/payments";
import { getCashfreeGateway, paymentsDisabled } from "@/lib/payments/cashfree";
import { siteUrl } from "@/lib/ticket-qr";

// Start paying for a held booking: creates (or reuses) a Cashfree order and
// hands the browser the payment session to open the checkout with. The
// booking is confirmed later, by /api/bookings/confirm, only once Cashfree
// says the order is PAID.
export async function POST(req: Request) {
  const parsed = payBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (paymentsDisabled()) return NextResponse.json({ mode: "disabled" });

  const gw = getCashfreeGateway();
  if (!gw) return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });

  const session = await auth.api.getSession({ headers: req.headers });
  const base = siteUrl();
  let result;
  try {
    result = await beginPayment(db, gw, {
      bookingId: parsed.data.bookingId,
      memberId: session?.user?.id,
      phone: parsed.data.phone,
      // Cashfree substitutes {order_id} itself; the return page settles the order.
      returnUrl: `${base}/booking/return?order_id={order_id}`,
      notifyUrl: webhookUrl(base),
    });
  } catch (e) {
    // Cashfree refused or is unreachable: surface a clean error, keep the hold.
    const detail = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
    console.error("[cashfree] create order failed", detail ?? e);
    return NextResponse.json({ error: "gateway_error" }, { status: 502 });
  }
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}

// Cashfree only accepts an HTTPS notify_url, so local dev relies on the
// browser-driven confirm; the webhook is the backstop in production.
function webhookUrl(base: string): string | undefined {
  const explicit = process.env.CASHFREE_WEBHOOK_URL;
  if (explicit) return explicit;
  return base.startsWith("https://") ? `${base}/api/payments/cashfree/webhook` : undefined;
}
