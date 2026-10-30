import { GST_RATE } from "../tariff";
import type { Quote } from "./booking";

/** A discount code set up in the admin dashboard. `value` is a percentage
 * (1–100) for "percent", or paise for "flat". */
export type Coupon = { code: string; kind: "percent" | "flat"; value: number };

/** Codes are matched without regard to case or surrounding spaces. */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

/** The quote with a coupon applied. The discount comes off the price before
 * GST, and GST is charged on what is left, so the invoice's taxable value is
 * the discounted amount. A flat discount never exceeds the price. */
export function applyCoupon<Q extends Pick<Quote, "subtotalMinor" | "discount" | "taxMinor" | "totalMinor">>(
  quote: Q,
  coupon: Coupon,
): Q {
  const raw =
    coupon.kind === "percent" ? Math.round((quote.subtotalMinor * coupon.value) / 100) : coupon.value;
  const amountMinor = Math.max(0, Math.min(raw, quote.subtotalMinor));
  const taxableMinor = quote.subtotalMinor - amountMinor;
  const taxMinor = Math.round(taxableMinor * GST_RATE);
  return {
    ...quote,
    discount: { code: coupon.code, amountMinor },
    taxMinor,
    totalMinor: taxableMinor + taxMinor,
  };
}
