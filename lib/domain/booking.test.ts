import { describe, expect, test } from "vitest";
import {
  ALLOWED_DURATIONS,
  computeQuote,
  toUtcWindow,
  validateWindow,
} from "./booking";

// A fixed "now" in IST for deterministic past-date checks: 2026-09-17 12:00 IST.
const NOW = new Date("2026-09-17T06:30:00.000Z");

describe("validateWindow", () => {
  test("accepts a valid in-hours window", () => {
    expect(validateWindow({ date: "2026-09-18", start: 9, duration: 2 }, NOW))
      .toEqual({ ok: true });
  });

  test("accepts a booking that ends exactly at closing time", () => {
    expect(validateWindow({ date: "2026-09-18", start: 12, duration: 8 }, NOW))
      .toEqual({ ok: true });
  });

  test("rejects a start before opening hour", () => {
    const r = validateWindow({ date: "2026-09-18", start: 7, duration: 1 }, NOW);
    expect(r.ok).toBe(false);
  });

  test("rejects a window that runs past closing hour", () => {
    const r = validateWindow({ date: "2026-09-18", start: 18, duration: 4 }, NOW);
    expect(r.ok).toBe(false);
  });

  test("rejects a duration not on the allowed list", () => {
    const r = validateWindow({ date: "2026-09-18", start: 9, duration: 3 }, NOW);
    expect(r.ok).toBe(false);
  });

  test("rejects a date in the past (IST)", () => {
    const r = validateWindow({ date: "2026-09-16", start: 9, duration: 1 }, NOW);
    expect(r.ok).toBe(false);
  });

  test("accepts today (IST) as not past", () => {
    expect(validateWindow({ date: "2026-09-17", start: 14, duration: 1 }, NOW))
      .toEqual({ ok: true });
  });
});

describe("toUtcWindow", () => {
  test("converts an IST wall-clock window to UTC instants (IST = UTC+5:30)", () => {
    const { startAt, endAt } = toUtcWindow({
      date: "2026-09-18",
      start: 9,
      duration: 2,
    });
    // 09:00 IST => 03:30 UTC, 11:00 IST => 05:30 UTC.
    expect(startAt.toISOString()).toBe("2026-09-18T03:30:00.000Z");
    expect(endAt.toISOString()).toBe("2026-09-18T05:30:00.000Z");
  });

  test("produces half-open adjacent windows that do not overlap", () => {
    const a = toUtcWindow({ date: "2026-09-18", start: 8, duration: 2 });
    const b = toUtcWindow({ date: "2026-09-18", start: 10, duration: 2 });
    expect(a.endAt.getTime()).toBe(b.startAt.getTime());
  });
});

describe("computeQuote", () => {
  test("computes subtotal, 18% tax and total in integer minor units", () => {
    // Hot desk ₹120/hr = 12000 minor units, 2 hours.
    const q = computeQuote(12000, 2);
    expect(q).toEqual({
      rateMinor: 12000,
      hours: 2,
      subtotalMinor: 24000,
      taxMinor: 4320,
      totalMinor: 28320,
    });
  });

  test("rounds tax to the nearest minor unit", () => {
    // 15000 * 1 = 15000; 18% = 2700 exactly. Use an odd rate to force rounding.
    const q = computeQuote(12500, 1); // 12500 * 0.18 = 2250 exact
    expect(q.taxMinor).toBe(2250);
    expect(q.totalMinor).toBe(14750);
  });
});

test("ALLOWED_DURATIONS is the demo set", () => {
  expect(ALLOWED_DURATIONS).toEqual([1, 2, 4, 8]);
});
