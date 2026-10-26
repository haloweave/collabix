// Cashfree Payment Gateway, behind a small interface so the domain layer and
// its tests never touch the network. Verified against cashfree-pg@6.0.6
// (API version 2026-01-01) on 2026-10-26.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Cashfree, CFEnvironment } from "cashfree-pg";

export type CashfreeMode = "sandbox" | "production";

export type GatewayOrder = {
  cfOrderId: string | null;
  paymentSessionId: string | null;
  /** ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED */
  orderStatus: string;
};

export type GatewayPayment = {
  cfPaymentId: string | null;
  /** SUCCESS | FAILED | PENDING | USER_DROPPED | ... */
  status: string;
  /** rupees */
  amount: number;
  method: string | null;
  raw: unknown;
};

export type CreateOrderInput = {
  orderId: string;
  amountRupees: number;
  customerId: string;
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  notifyUrl?: string;
  expiresAt: Date;
  note?: string;
};

export interface CashfreeGateway {
  mode: CashfreeMode;
  createOrder(input: CreateOrderInput): Promise<GatewayOrder>;
  fetchOrder(orderId: string): Promise<GatewayOrder>;
  fetchPayments(orderId: string): Promise<GatewayPayment[]>;
}

export function cashfreeMode(): CashfreeMode {
  return process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
}

/** Dev-only: confirm bookings without collecting payment. Never set in prod. */
export function paymentsDisabled(): boolean {
  return process.env.PAYMENTS_DISABLED === "true";
}

/** Null when CASHFREE_APP_ID / CASHFREE_SECRET_KEY are not both set. */
export function getCashfreeGateway(): CashfreeGateway | null {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) return null;
  const mode = cashfreeMode();
  const sdk = new Cashfree(
    mode === "production" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
    appId,
    secret,
  );
  return {
    mode,
    async createOrder(input) {
      const res = await sdk.PGCreateOrder({
        order_id: input.orderId,
        order_amount: input.amountRupees,
        order_currency: "INR",
        customer_details: {
          customer_id: input.customerId,
          customer_phone: input.customerPhone,
          customer_email: input.customerEmail,
          customer_name: input.customerName,
        },
        order_meta: {
          return_url: input.returnUrl,
          ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
        },
        order_expiry_time: input.expiresAt.toISOString(),
        ...(input.note ? { order_note: input.note } : {}),
      });
      const d = res.data;
      return {
        cfOrderId: d.cf_order_id ?? null,
        paymentSessionId: d.payment_session_id ?? null,
        orderStatus: d.order_status ?? "ACTIVE",
      };
    },
    async fetchOrder(orderId) {
      const d = (await sdk.PGFetchOrder(orderId)).data;
      return {
        cfOrderId: d.cf_order_id ?? null,
        paymentSessionId: d.payment_session_id ?? null,
        orderStatus: d.order_status ?? "ACTIVE",
      };
    },
    async fetchPayments(orderId) {
      const rows = (await sdk.PGOrderFetchPayments(orderId)).data ?? [];
      return rows.map((p) => ({
        cfPaymentId: p.cf_payment_id ?? null,
        status: p.payment_status ?? "PENDING",
        amount: p.payment_amount ?? 0,
        method: p.payment_group ?? null,
        raw: p,
      }));
    },
  };
}

/**
 * Cashfree signs webhooks as base64(HMAC-SHA256(secret, timestamp + rawBody))
 * with the API secret key. Compare against the raw body exactly as received.
 */
export function verifyWebhookSignature(
  secret: string,
  signature: string,
  timestamp: string,
  rawBody: string,
): boolean {
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest();
  const given = Buffer.from(signature, "base64");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** Paise → rupees with at most two decimals (Cashfree's order_amount). */
export function toOrderAmount(minor: number): number {
  return Math.round(minor) / 100;
}

/**
 * Random order id (cbx_ + 22 base64url chars, within Cashfree's 45-char
 * [A-Za-z0-9_-] rule). Opaque on purpose: it shows up on receipts and in the
 * return URL, and the payment row maps it back to the booking.
 */
export function newOrderId(): string {
  return `cbx_${randomBytes(16).toString("base64url")}`;
}

/** Random customer id (32 hex chars; Cashfree wants 3–50 alphanumerics). */
export function newCustomerId(): string {
  return randomBytes(16).toString("hex");
}

/** Cashfree wants a 10-digit Indian number; other countries keep their +CC. */
export function toCashfreePhone(phone: string): string {
  const trimmed = phone.trim();
  if (/^\+91\d{10}$/.test(trimmed)) return trimmed.slice(3);
  return trimmed;
}
