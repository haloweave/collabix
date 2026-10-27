import { describe, expect, test } from "vitest";
import {
  BOOKABLE,
  REGISTRY_PLANS,
  TERM_PLANS,
  bookableProduct,
  findTermPlan,
  productPriceMinor,
  rateForCode,
  termMonthlyMinor,
} from "./tariff";

describe("bookable catalogue", () => {
  test("bookable prices come from the tariff rows", () => {
    expect(bookableProduct("day-full")!.priceMinor).toBe(39900);
    expect(bookableProduct("day-half")!.priceMinor).toBe(19900);
    expect(bookableProduct("meeting-4")!.priceMinor).toBe(35000);
    expect(bookableProduct("boardroom")!.priceMinor).toBe(75000);
    expect(BOOKABLE.map((p) => p.earlyBirdMinor)).toEqual([37500, 17500, 30000, 70000]);
  });

  test("names and rooms match the tariff rows", () => {
    expect(BOOKABLE.map((p) => p.name)).toEqual([
      "Full Day Pass",
      "Half Day Pass",
      "Meeting Room (4-seater)",
      "The Boardroom",
    ]);
    expect(BOOKABLE.map((p) => p.roomCode)).toEqual([null, null, "M-02", "M-01"]);
  });

  test("productPriceMinor uses early bird only while open", () => {
    const dayFull = bookableProduct("day-full")!;
    expect(productPriceMinor(dayFull, new Date("2026-10-10T06:00:00Z"))).toBe(37500);
    expect(productPriceMinor(dayFull, new Date("2026-10-26T06:00:00Z"))).toBe(39900);
  });

  test("keys outside the tariff are unknown", () => {
    expect(bookableProduct("hotdesk")).toBeUndefined();
  });
});

describe("rateForCode (interim extended-booking hints)", () => {
  test("desks use a twelfth of the Full Day Pass, rooms their hourly price, cabins nothing", () => {
    const LATER = new Date("2026-10-26T06:00:00Z");
    expect(rateForCode("D-01", "desk", LATER)).toBe(3325);
    expect(rateForCode("M-01", "room", LATER)).toBe(75000);
    expect(rateForCode("M-02", "room", LATER)).toBe(35000);
    expect(rateForCode("C-01", "room", LATER)).toBe(0);
  });
});

describe("monthly & annual term plans", () => {
  test("prices come from the desk and cabin tariff rows", () => {
    expect(TERM_PLANS.map((p) => [p.key, p.monthlyMinor, p.earlyBirdMinor, p.annualMinor])).toEqual([
      ["hot-desk", 600000, 540000, 7200000],
      ["dedicated-desk", 850000, 770000, 10200000],
      ["dedicated-desk-pro", 1000000, 900000, 12000000],
      ["cabin-base", 2400000, 2160000, 28800000],
      ["cabin-pro", 3400000, 3080000, 40800000],
      ["cabin-enterprise", 4000000, 3600000, 48000000],
    ]);
  });

  test("desks seat one, cabins four", () => {
    expect(findTermPlan("hot-desk")).toMatchObject({ space: "desk", seats: 1 });
    expect(findTermPlan("cabin-pro")).toMatchObject({ space: "cabin", seats: 4 });
    expect(findTermPlan("day-full")).toBeUndefined();
  });

  test("the monthly rate is Early Bird only while the offer is open", () => {
    const hot = findTermPlan("hot-desk")!;
    expect(termMonthlyMinor(hot, new Date("2026-10-10T06:00:00Z"))).toBe(540000);
    expect(termMonthlyMinor(hot, new Date("2026-10-26T06:00:00Z"))).toBe(600000);
  });

  test("every term plan has a rate_plan registry row", () => {
    const keys = new Set(REGISTRY_PLANS.map((p) => p.key));
    for (const p of TERM_PLANS) expect(keys.has(p.key)).toBe(true);
    expect(REGISTRY_PLANS.find((p) => p.key === "cabin-base")?.appliesToKind).toBe("room");
  });
});
