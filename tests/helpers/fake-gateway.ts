// Scripted stand-in for Cashfree: records created orders and returns whatever
// status the test sets, so settlement runs against the real DB with no network.

import type {
  CashfreeGateway,
  CreateOrderInput,
  GatewayOrder,
  GatewayPayment,
  GatewayRefund,
} from "../../lib/payments/cashfree";

type FakeOrder = { input: CreateOrderInput; status: string; payments: GatewayPayment[] };

export class FakeGateway implements CashfreeGateway {
  mode = "sandbox" as const;
  orders = new Map<string, FakeOrder>();
  refunds = new Map<string, { orderId: string; amountRupees: number; status: string }>();
  /** Status the next createRefund reports; set "THROW" to simulate an API error. */
  nextRefundStatus = "SUCCESS";

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    this.orders.set(input.orderId, { input, status: "ACTIVE", payments: [] });
    return { cfOrderId: `cf_${input.orderId}`, paymentSessionId: `sess_${input.orderId}`, orderStatus: "ACTIVE" };
  }

  async fetchOrder(orderId: string): Promise<GatewayOrder> {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`fake gateway: unknown order ${orderId}`);
    return { cfOrderId: `cf_${orderId}`, paymentSessionId: `sess_${orderId}`, orderStatus: o.status };
  }

  async fetchPayments(orderId: string): Promise<GatewayPayment[]> {
    return this.orders.get(orderId)?.payments ?? [];
  }

  /** Flip an order's status; PAID also records one successful UPI payment. */
  setStatus(orderId: string, status: "ACTIVE" | "PAID" | "EXPIRED") {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`fake gateway: unknown order ${orderId}`);
    o.status = status;
    if (status === "PAID") {
      o.payments = [
        { cfPaymentId: `pay_${orderId}`, status: "SUCCESS", amount: o.input.amountRupees, method: "upi", raw: { ok: true } },
      ];
    }
  }

  async createRefund(input: { orderId: string; refundId: string; amountRupees: number }): Promise<GatewayRefund> {
    if (this.nextRefundStatus === "THROW") throw new Error("fake gateway: refund API down");
    const existing = this.refunds.get(input.refundId);
    if (existing) return { cfRefundId: `cfr_${input.refundId}`, status: existing.status, raw: existing };
    const r = { orderId: input.orderId, amountRupees: input.amountRupees, status: this.nextRefundStatus };
    this.refunds.set(input.refundId, r);
    return { cfRefundId: `cfr_${input.refundId}`, status: r.status, raw: r };
  }

  async fetchRefund(_orderId: string, refundId: string): Promise<GatewayRefund> {
    const r = this.refunds.get(refundId);
    if (!r) throw new Error(`fake gateway: unknown refund ${refundId}`);
    return { cfRefundId: `cfr_${refundId}`, status: r.status, raw: r };
  }
}
