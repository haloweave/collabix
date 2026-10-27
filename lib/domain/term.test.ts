import { describe, expect, test } from "vitest";
import { findTermPlan } from "../tariff";
import { addMonths, priceTerm, termWindow } from "./term";

const NOW = new Date("2026-10-27T06:00:00Z"); // 11:30 IST, after the Early Bird offer
const EARLY = new Date("2026-10-10T06:00:00Z");

describe("addMonths", () => {
  test("keeps the day of the month", () => {
    expect(addMonths("2026-11-05", 1)).toBe("2026-12-05");
    expect(addMonths("2026-11-05", 3)).toBe("2027-02-05");
    expect(addMonths("2026-11-05", 24)).toBe("2028-11-05");
  });

  test("clamps to the end of a shorter month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-10-31", 1)).toBe("2026-11-30");
  });
});

describe("termWindow", () => {
  test("runs from IST midnight to IST midnight N months later", () => {
    const w = termWindow({ date: "2026-11-01", unit: "month", count: 3 }, NOW);
    expect(w).toEqual({
      ok: true,
      window: {
        startDate: "2026-11-01",
        endDate: "2027-02-01",
        startAt: new Date("2026-10-31T18:30:00Z"),
        endAt: new Date("2027-01-31T18:30:00Z"),
      },
    });
  });

  test("a year is twelve months", () => {
    const w = termWindow({ date: "2026-11-01", unit: "year", count: 2 }, NOW);
    expect(w.ok && w.window.endDate).toBe("2028-11-01");
  });

  test("may start today but not in the past or too far ahead", () => {
    expect(termWindow({ date: "2026-10-27", unit: "month", count: 1 }, NOW).ok).toBe(true);
    expect(termWindow({ date: "2026-10-26", unit: "month", count: 1 }, NOW)).toEqual({ ok: false, error: "date is in the past" });
    expect(termWindow({ date: "2027-01-25", unit: "month", count: 1 }, NOW).ok).toBe(true);
    expect(termWindow({ date: "2027-01-26", unit: "month", count: 1 }, NOW).ok).toBe(false);
  });

  test("monthly terms run 1–11 months, annual 1–3 years", () => {
    const at = (unit: "month" | "year", count: number) => termWindow({ date: "2026-11-01", unit, count }, NOW).ok;
    expect([at("month", 0), at("month", 1), at("month", 11), at("month", 12)]).toEqual([false, true, true, false]);
    expect([at("year", 0), at("year", 1), at("year", 3), at("year", 4)]).toEqual([false, true, true, false]);
    expect(at("month", 1.5)).toBe(false);
  });
});

describe("priceTerm", () => {
  const hot = findTermPlan("hot-desk")!;
  const cabin = findTermPlan("cabin-enterprise")!;

  test("months are the monthly rate times the count, plus GST", () => {
    const q = priceTerm(hot, { unit: "month", count: 3 }, NOW);
    expect(q.lines).toEqual([{ label: "Hot Desk Flexi · monthly", qty: 3, unitMinor: 600000, amountMinor: 1800000 }]);
    expect(q.subtotalMinor).toBe(1800000);
    expect(q.taxMinor).toBe(324000);
    expect(q.totalMinor).toBe(2124000);
    expect(q).toMatchObject({ productKey: "hot-desk", months: 3, hours: 0 });
  });

  test("months use the Early Bird rate while the offer is open", () => {
    expect(priceTerm(hot, { unit: "month", count: 2 }, EARLY).subtotalMinor).toBe(1080000);
  });

  test("years are the Annual tariff column times the count", () => {
    const q = priceTerm(cabin, { unit: "year", count: 3 }, EARLY);
    expect(q.lines[0]).toMatchObject({ label: "Cabin · Enterprise · annual", qty: 3, unitMinor: 48000000 });
    expect(q.subtotalMinor).toBe(144000000);
    expect(q.totalMinor).toBe(169920000);
    expect(q.months).toBe(36);
  });
});
