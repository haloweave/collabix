import { describe, expect, test } from "vitest";
import {
  MAX_DURATION,
  PRESET_DURATIONS,
  nightHours,
  priceBooking,
  toUtcWindow,
  validateWindow,
} from "./booking";
import { bookableProduct } from "../tariff";

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

describe("nightHours", () => {
  test("counts hours inside 20:00–07:00, wrapping past midnight", () => {
    expect(nightHours(9, 3)).toBe(0);
    expect(nightHours(19, 3)).toBe(2);
    expect(nightHours(6, 3)).toBe(1);
    expect(nightHours(22, 6)).toBe(6);
    expect(nightHours(18, 12)).toBe(10);
  });
});

describe("priceBooking", () => {
  // After the Early Bird offer, so standard tariff prices apply.
  const LATER = new Date("2026-10-26T06:30:00.000Z");
  const day = { date: "2026-10-27", start: 8, duration: 12 };

  test("Full Day Pass is priced per person with 18% GST", () => {
    const q = priceBooking(bookableProduct("day-full")!, day, 3, LATER);
    expect(q.lines).toEqual([{ label: "Full Day Pass", qty: 3, unitMinor: 39900, amountMinor: 119700 }]);
    expect(q.subtotalMinor).toBe(119700);
    expect(q.taxMinor).toBe(21546);
    expect(q.totalMinor).toBe(141246);
  });

  test("Half Day Pass for one person", () => {
    const q = priceBooking(bookableProduct("day-half")!, { date: "2026-10-27", start: 9, duration: 4 }, 1, LATER);
    expect([q.subtotalMinor, q.taxMinor, q.totalMinor]).toEqual([19900, 3582, 23482]);
  });

  test("Boardroom hours after 20:00 carry the 20% after-hours charge", () => {
    const q = priceBooking(bookableProduct("boardroom")!, { date: "2026-10-27", start: 19, duration: 3 }, 1, LATER);
    expect(q.lines).toEqual([
      { label: "The Boardroom", qty: 1, unitMinor: 75000, amountMinor: 75000 },
      { label: "The Boardroom · after hours (+20%)", qty: 2, unitMinor: 90000, amountMinor: 180000 },
    ]);
    expect([q.subtotalMinor, q.taxMinor, q.totalMinor]).toEqual([255000, 45900, 300900]);
  });

  test("an overnight meeting room booking is all after-hours", () => {
    const q = priceBooking(bookableProduct("meeting-4")!, { date: "2026-10-27", start: 22, duration: 6 }, 1, LATER);
    expect(q.lines).toEqual([
      { label: "Meeting Room (4-seater) · after hours (+20%)", qty: 6, unitMinor: 42000, amountMinor: 252000 },
    ]);
    expect(q.subtotalMinor).toBe(252000);
  });

  test("rooms ignore the people count", () => {
    const q = priceBooking(bookableProduct("meeting-4")!, { date: "2026-10-27", start: 10, duration: 2 }, 5, LATER);
    expect(q.seats).toBe(1);
    expect(q.subtotalMinor).toBe(70000);
  });
});

test("durations run up to 12 hours, with quick presets", () => {
  expect(MAX_DURATION).toBe(12);
  expect(PRESET_DURATIONS).toEqual([1, 2, 4, 8]);
});
