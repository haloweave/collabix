import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  newCustomerId,
  newOrderId,
  toCashfreePhone,
  toOrderAmount,
  verifyWebhookSignature,
} from "./cashfree";

const secret = "cfsk_ma_test_secret";
const sign = (ts: string, body: string) =>
  createHmac("sha256", secret).update(ts + body).digest("base64");

describe("verifyWebhookSignature", () => {
  const ts = "1785401067911";
  const body = '{"data":{"order":{"order_id":"cbx_1","order_amount":170.00}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';

  test("accepts the signature Cashfree computes over timestamp + raw body", () => {
    expect(verifyWebhookSignature(secret, sign(ts, body), ts, body)).toBe(true);
  });

  test("rejects a body that was altered after signing", () => {
    const tampered = body.replace("170.00", "1.00");
    expect(verifyWebhookSignature(secret, sign(ts, body), ts, tampered)).toBe(false);
  });

  test("rejects a replay under a different timestamp", () => {
    expect(verifyWebhookSignature(secret, sign(ts, body), "1785401999999", body)).toBe(false);
  });

  test("rejects a signature of the wrong length without throwing", () => {
    expect(verifyWebhookSignature(secret, "short", ts, body)).toBe(false);
  });
});

describe("toOrderAmount", () => {
  test("converts paise to rupees with at most two decimals", () => {
    expect(toOrderAmount(28320)).toBe(283.2);
    expect(toOrderAmount(100)).toBe(1);
    expect(toOrderAmount(12345)).toBe(123.45);
  });
});

describe("newOrderId", () => {
  test("is random, fits Cashfree's id rules and never embeds the booking id", () => {
    const bookingId = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const a = newOrderId();
    const b = newOrderId();
    expect(a).toMatch(/^cbx_[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(bookingId.replace(/-/g, ""));
  });
});

describe("newCustomerId", () => {
  test("is 32 alphanumeric chars, as Cashfree requires, and random", () => {
    const a = newCustomerId();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(a).not.toBe(newCustomerId());
  });
});

describe("toCashfreePhone", () => {
  test("strips +91 down to the 10-digit national number", () => {
    expect(toCashfreePhone("+919876543210")).toBe("9876543210");
  });
  test("leaves a 10-digit number alone", () => {
    expect(toCashfreePhone("9876543210")).toBe("9876543210");
  });
  test("passes other international numbers through with their +", () => {
    expect(toCashfreePhone("+447700900123")).toBe("+447700900123");
  });
});
