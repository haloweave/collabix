import { describe, expect, test } from "vitest";
import { findTermPlan } from "../tariff";
import { applyCoupon, normalizeCouponCode } from "./coupon";
import { priceTerm } from "./term";

const NOW = new Date("2026-10-27T06:00:00Z"); // after the Early Bird offer
// Dedicated Desk, 6 months: ₹51,000 + ₹9,180 GST = ₹60,180.
const desk = priceTerm(findTermPlan("dedicated-desk")!, { unit: "month", count: 6 }, NOW);

describe("applyCoupon", () => {
  test("takes a percentage off the price before GST", () => {
    const q = applyCoupon(desk, { code: "TEN", kind: "percent", value: 10 });
    expect(q.discount).toEqual({ code: "TEN", amountMinor: 510000 });
    expect(q.subtotalMinor).toBe(5100000);
    // GST on ₹45,900.
    expect(q.taxMinor).toBe(826200);
    expect(q.totalMinor).toBe(5416200);
  });

  test("takes a flat amount off the price before GST", () => {
    const q = applyCoupon(desk, { code: "FLAT1000", kind: "flat", value: 100000 });
    expect(q.discount?.amountMinor).toBe(100000);
    expect(q.totalMinor).toBe(5000000 + 900000);
  });

  test("never discounts more than the price", () => {
    const q = applyCoupon(desk, { code: "HUGE", kind: "flat", value: 99_999_999 });
    expect(q.discount?.amountMinor).toBe(5100000);
    expect(q.taxMinor).toBe(0);
    expect(q.totalMinor).toBe(0);
  });

  test("keeps the lines as priced", () => {
    const q = applyCoupon(desk, { code: "TEN", kind: "percent", value: 10 });
    expect(q.lines).toEqual(desk.lines);
  });
});

describe("normalizeCouponCode", () => {
  test("ignores case and surrounding spaces", () => {
    expect(normalizeCouponCode("  welcome10 ")).toBe("WELCOME10");
  });
});
