import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { settlePayment } from "@/lib/domain/payments";
import { getCashfreeGateway } from "@/lib/payments/cashfree";
import { sendTicketEmail } from "@/lib/ticket-email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Payment — Collabix",
  robots: { index: false, follow: false },
};

// Where Cashfree sends the guest back when the checkout could not stay in the
// modal (in-app browsers, some UPI apps). Settles the order and hands them
// their ticket, or says plainly what happened.
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id: orderId } = await searchParams;
  const gw = getCashfreeGateway();
  const settled = orderId && gw ? await settlePayment(db, gw, { orderId }) : null;

  if (settled?.ok && settled.status === "paid") {
    if (settled.newlyConfirmed) {
      // After the response, like the API routes: a frozen serverless
      // function must not drop the one and only ticket email.
      const bookingId = settled.bookingId;
      after(async () => {
        try {
          await sendTicketEmail(bookingId);
        } catch (e) {
          console.error("[ticket-email] send failed", e);
        }
      });
    }
    redirect(`/t/${settled.ticketToken}`);
  }

  const copy = message(settled);
  return (
    <section className="pad section-ivory booking-page">
      <div className="wrap" style={{ maxWidth: 560 }}>
        <span className="eyebrow">Payment</span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <Link className="btn btn-gold" href="/book">
          Back to booking <span className="arw">→</span>
        </Link>
      </div>
    </section>
  );
}

function message(settled: Awaited<ReturnType<typeof settlePayment>> | null) {
  if (!settled || !settled.ok) {
    return {
      title: "We couldn't find that payment.",
      body: "The link may be incomplete. Start a new booking and your seat will be held again.",
    };
  }
  switch (settled.status) {
    case "pending":
      return {
        title: "Still waiting for the bank.",
        body: "Your payment hasn't been confirmed yet. If money was debited, you'll receive your ticket by email within a few minutes.",
      };
    case "refund_due":
      return {
        title: "That seat was taken while you paid.",
        body: "We're sorry — someone else's hold landed first. Your payment will be refunded in full, and you can book another seat now.",
      };
    default:
      return {
        title: "Payment didn't go through.",
        body: "Nothing was charged. Start again and your seat will be held while you pay.",
      };
  }
}
