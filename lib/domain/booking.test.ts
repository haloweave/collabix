import { describe, expect, test } from "vitest";
import {
  MAX_DURATION,
  PRESET_DURATIONS,
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

  test("accepts any start hour, day or night (open 24/7)", () => {
    for (const start of [0, 3, 7, 21, 23]) {
      expect(validateWindow({ date: "2026-09-18", start, duration: 1 }, NOW)).toEqual({ ok: true });
    }
  });

  test("accepts an overnight booking that runs past midnight", () => {
    expect(validateWindow({ date: "2026-09-18", start: 22, duration: 6 }, NOW))
      .toEqual({ ok: true });
  });

  test("rejects a start hour outside 0–23", () => {
    for (const start of [-1, 24, 9.5]) {
      expect(validateWindow({ date: "2026-09-18", start, duration: 1 }, NOW).ok).toBe(false);
    }
  });

  test("accepts a custom whole-hour duration", () => {
    expect(validateWindow({ date: "2026-09-18", start: 9, duration: 6 }, NOW))
      .toEqual({ ok: true });
  });

  test("accepts the 12-hour maximum", () => {
    expect(validateWindow({ date: "2026-09-18", start: 20, duration: 12 }, NOW))
      .toEqual({ ok: true });
  });

  test("rejects a zero, fractional or over-long duration", () => {
    for (const duration of [0, 1.5, 13]) {
      expect(validateWindow({ date: "2026-09-18", start: 8, duration }, NOW).ok).toBe(false);
    }
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
      seats: 1,
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

  test("defaults to a single seat", () => {
    expect(computeQuote(12000, 2).seats).toBe(1);
  });

  test("scales subtotal, tax and total by the number of seats", () => {
    const one = computeQuote(12000, 2, 1);
    const three = computeQuote(12000, 2, 3);
    expect(three.seats).toBe(3);
    expect(three.subtotalMinor).toBe(one.subtotalMinor * 3);
    expect(three.taxMinor).toBe(Math.round(one.subtotalMinor * 3 * 0.18));
    expect(three.totalMinor).toBe(three.subtotalMinor + three.taxMinor);
  });
});

test("durations run up to 12 hours, with quick presets", () => {
  expect(MAX_DURATION).toBe(12);
  expect(PRESET_DURATIONS).toEqual([1, 2, 4, 8]);
});
