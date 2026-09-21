// Payment gateway abstraction. A Razorpay adapter activates when RAZORPAY_KEY_ID
// and RAZORPAY_KEY_SECRET are set; otherwise the app runs in "manual" mode where
// staff mark invoices paid by hand. Kept behind this interface so adding or
// swapping a gateway is a local change.

export type PaymentOrder = {
  provider: "razorpay";
  orderId: string;
  amountMinor: number;
};

export function paymentsEnabled(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Create a gateway order for an invoice. Returns null in manual mode (no keys),
 * signalling the caller to fall back to "mark paid by hand".
 */
export async function createPaymentOrder(input: {
  amountMinor: number;
  receipt: string;
}): Promise<PaymentOrder | null> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
    },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: "INR",
      receipt: input.receipt,
    }),
  });
  if (!res.ok) throw new Error(`razorpay order failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return { provider: "razorpay", orderId: data.id, amountMinor: input.amountMinor };
}
