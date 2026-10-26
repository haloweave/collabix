import { describe, expect, test } from "vitest";
import {
  CODE_ALPHABET,
  istDayStart,
  isTicketToken,
  normalizeTicketInput,
  ticketState,
  type TicketBooking,
} from "./ticket";
import { newTicketCode, newTicketToken } from "./ticket-codes";
import { ticketAmount, ticketSeats, ticketWhen } from "./ticket-display";

const ist = (s: string) => new Date(`${s}:00+05:30`); // "2026-12-01T08:00"

const single = (over: Partial<TicketBooking> = {}): TicketBooking => ({
  status: "active",
  confirmed: true,
  startAt: ist("2026-12-01T09:00"),
  endAt: ist("2026-12-01T11:00"),
  checkedInAt: null,
  checkedOutAt: null,
  openHour: 8,
  closeHour: 20,
  ...over,
});

const multi = (over: Partial<TicketBooking> = {}): TicketBooking =>
  single({
    startAt: ist("2026-12-10T00:00"),
    endAt: ist("2026-12-13T00:00"), // 10th–12th inclusive
    ...over,
  });

describe("token & code generation", () => {
  test("token is 22 url-safe chars and unique", () => {
    const a = newTicketToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(isTicketToken(a)).toBe(true);
    expect(newTicketToken()).not.toBe(a);
  });

  test("code is CBX- plus 4 chars from the look-alike-free alphabet", () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 200; i++) {
      const c = newTicketCode();
      expect(c).toMatch(/^CBX-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    }
  });
});

describe("normalizeTicketInput", () => {
  const token = "AbCdEfGhIjKlMnOpQrSt_-";

  test("full ticket URL, any host, with or without trailing bits", () => {
    expect(normalizeTicketInput(`https://collabix.co.in/t/${token}`)).toEqual({ token });
    expect(normalizeTicketInput(`http://localhost:3000/t/${token}?x=1`)).toEqual({ token });
    expect(normalizeTicketInput(`https://x.trycloudflare.com/t/${token}/`)).toEqual({ token });
  });

  test("bare token", () => {
    expect(normalizeTicketInput(`  ${token} `)).toEqual({ token });
  });

  test("sloppy typed codes resolve", () => {
    for (const raw of ["CBX-7K4Q", "cbx-7k4q", "cbx 7k4q", "7k4q", " CBX7K4Q "]) {
      expect(normalizeTicketInput(raw)).toEqual({ code: "CBX-7K4Q" });
    }
  });

  test("look-alike or junk input is rejected, never guessed", () => {
    for (const raw of ["", "   ", "CBX-7K0Q", "CBX-OK4Q", "CBX-7K4", "CBX-7K4QQ", "hello world", "https://evil.com/x"]) {
      expect(normalizeTicketInput(raw)).toBeNull();
    }
  });
});

describe("istDayStart", () => {
  test("00:10 IST belongs to the IST day even though UTC is still yesterday", () => {
    const d = ist("2026-12-01T00:10"); // 2026-11-30T18:40Z
    expect(istDayStart(d).toISOString()).toBe(ist("2026-12-01T00:00").toISOString());
  });
});

describe("ticketState — single-day", () => {
  test("cancelled / not confirmed win over time", () => {
    expect(ticketState(single({ status: "cancelled" }), ist("2026-12-01T09:30")).phase).toBe("cancelled");
    expect(ticketState(single({ confirmed: false }), ist("2026-12-01T09:30")).phase).toBe("not_confirmed");
  });

  test("window boundaries", () => {
    const b = single();
    expect(ticketState(b, ist("2026-12-01T08:29")).phase).toBe("too_early");
    expect(ticketState(b, ist("2026-12-01T08:30")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-01T10:59")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-01T11:00")).phase).toBe("ended");
  });

  test("just after IST midnight on the booking day is too_early, not other_day", () => {
    expect(ticketState(single(), ist("2026-12-01T00:10")).phase).toBe("too_early");
  });

  test("a different day is other_day; a past day is ended", () => {
    expect(ticketState(single(), ist("2026-11-30T09:30")).phase).toBe("other_day");
    expect(ticketState(single(), ist("2026-12-02T09:30")).phase).toBe("ended");
  });

  test("an overnight booking stays valid after IST midnight", () => {
    const b = single({ startAt: ist("2026-12-01T22:00"), endAt: ist("2026-12-02T04:00") });
    expect(ticketState(b, ist("2026-12-01T21:00")).phase).toBe("too_early");
    expect(ticketState(b, ist("2026-12-02T01:30")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-02T04:00")).phase).toBe("ended");
  });

  test("an overnight check-in still counts after midnight", () => {
    const s = ticketState(
      single({
        startAt: ist("2026-12-01T22:00"),
        endAt: ist("2026-12-02T04:00"),
        checkedInAt: ist("2026-12-01T22:05"),
      }),
      ist("2026-12-02T01:30"),
    );
    expect(s.checkedInAt?.toISOString()).toBe(ist("2026-12-01T22:05").toISOString());
  });

  test("check-in stamps surface", () => {
    const s = ticketState(
      single({ checkedInAt: ist("2026-12-01T08:50") }),
      ist("2026-12-01T09:30"),
    );
    expect(s.checkedInAt?.toISOString()).toBe(ist("2026-12-01T08:50").toISOString());
    expect(s.checkedOutAt).toBeNull();
    expect(s.multiDay).toBe(false);
  });
});

describe("ticketState — multi-day", () => {
  test("valid each day in range during opening hours", () => {
    const b = multi();
    expect(ticketState(b, ist("2026-12-09T09:00")).phase).toBe("other_day");
    expect(ticketState(b, ist("2026-12-10T07:29")).phase).toBe("too_early");
    expect(ticketState(b, ist("2026-12-10T07:30")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-11T19:59")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-11T20:00")).phase).toBe("ended"); // done for today
    expect(ticketState(b, ist("2026-12-12T12:00")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-12T20:00")).phase).toBe("ended");
    expect(ticketState(b, ist("2026-12-13T09:00")).phase).toBe("ended");
  });

  test("yesterday's check-in and check-out do not count today", () => {
    const b = multi({
      checkedInAt: ist("2026-12-10T09:00"),
      checkedOutAt: ist("2026-12-10T18:00"),
    });
    const s = ticketState(b, ist("2026-12-11T09:00"));
    expect(s.multiDay).toBe(true);
    expect(s.checkedInAt).toBeNull();
    expect(s.checkedOutAt).toBeNull();
  });
});

describe("display copy", () => {
  test("single-day when line has date and IST time range", () => {
    const w = ticketWhen({ startAt: ist("2026-12-01T09:00"), endAt: ist("2026-12-01T11:00") });
    expect(w).toContain("2026");
    expect(w).toContain("IST");
  });

  test("multi-day when line shows the inclusive last day", () => {
    const w = ticketWhen({ startAt: ist("2026-12-10T00:00"), endAt: ist("2026-12-13T00:00") });
    expect(w).toContain("10");
    expect(w).toContain("12");
    expect(w).not.toContain("13");
  });

  test("amount and seats", () => {
    expect(ticketAmount({ totalMinor: 28320 })).toBe("₹283 · Pay at desk");
    expect(ticketAmount({ totalMinor: 28320, paid: true })).toBe("₹283 · Paid");
    expect(ticketAmount({ totalMinor: null })).toBe("Included in membership");
    expect(ticketAmount({ totalMinor: null, paid: true })).toBe("Included in membership");
    expect(ticketSeats({ seats: 2, resourceCodes: ["D-03", "D-04"] })).toBe("2 seats · D-03, D-04");
    expect(ticketSeats({ seats: 1, resourceCodes: ["M-01"] })).toBe("1 seat · M-01");
  });
});
