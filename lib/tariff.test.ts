import { describe, expect, test } from "vitest";
import { BOOKABLE, bookableProduct, productPriceMinor } from "./tariff";

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
