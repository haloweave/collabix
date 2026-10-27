import { describe, expect, test } from "vitest";
import { bookingStage, istDaysUntil, relativeDay } from "./booking-stage";

const ist = (s: string) => new Date(`${s}:00+05:30`);
const now = ist("2026-12-01T10:30");
const booking = (over: Partial<Parameters<typeof bookingStage>[0]> = {}) => ({
  status: "active" as const,
  confirmed: true,
  ticketed: true,
  pending: false,
  startAt: ist("2026-12-03T09:00"),
  endAt: ist("2026-12-03T13:00"),
  ...over,
});

describe("bookingStage", () => {
  test("confirmed bookings move from upcoming through today to completed", () => {
    expect(bookingStage(booking(), now)).toBe("upcoming");
    expect(bookingStage(booking({ startAt: ist("2026-12-01T18:00"), endAt: ist("2026-12-01T20:00") }), now)).toBe("today");
    expect(bookingStage(booking({ startAt: ist("2026-12-01T09:00"), endAt: ist("2026-12-01T13:00") }), now)).toBe("in-progress");
    expect(bookingStage(booking({ startAt: ist("2026-11-30T09:00"), endAt: ist("2026-11-30T13:00") }), now)).toBe("completed");
  });

  test("an unpaid live hold awaits payment; a lapsed one is hidden", () => {
    expect(bookingStage(booking({ confirmed: false, ticketed: false, pending: true }), now)).toBe("awaiting-payment");
    expect(bookingStage(booking({ confirmed: false, ticketed: false }), now)).toBeNull();
  });

  test("only a booking that was once confirmed shows as cancelled", () => {
    expect(bookingStage(booking({ status: "cancelled", confirmed: false }), now)).toBe("cancelled");
    expect(bookingStage(booking({ status: "cancelled", confirmed: false, ticketed: false }), now)).toBeNull();
  });
});

describe("relative days", () => {
  test("count IST calendar days, not 24-hour spans", () => {
    // 23:30 IST to 00:30 IST the next day is one day away.
    expect(istDaysUntil(ist("2026-12-02T00:30"), ist("2026-12-01T23:30"))).toBe(1);
    expect(relativeDay(ist("2026-12-01T18:00"), now)).toBe("Today");
    expect(relativeDay(ist("2026-12-02T09:00"), now)).toBe("Tomorrow");
    expect(relativeDay(ist("2026-12-05T09:00"), now)).toBe("In 4 days");
    expect(relativeDay(ist("2026-12-20T09:00"), now)).toBe("On 20 Dec");
  });
});
