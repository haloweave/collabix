// E-ticket domain: scan-input parsing and the ticket state machine shared by
// the guest ticket page and the staff scanner. Pure and client-safe — no DB,
// no Node APIs (generators live in ticket-codes.ts).

import { IST_OFFSET_MIN } from "./booking";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0 O 1 I L
export const CODE_PREFIX = "CBX-";
export const EARLY_CHECKIN_MIN = 30;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const IST_MS = IST_OFFSET_MIN * 60_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const URL_TOKEN_RE = /\/t\/([A-Za-z0-9_-]{22})(?:[/?#]|$)/;

export const isTicketToken = (s: string) => TOKEN_RE.test(s);

export type TicketLookup = { token: string } | { code: string };

/** Accepts a scanned ticket URL (any host), a bare token, or a typed backup
 * code in any case/spacing. Returns null rather than guessing. */
export function normalizeTicketInput(raw: string): TicketLookup | null {
  const s = raw.trim();
  if (!s) return null;
  const fromUrl = s.match(URL_TOKEN_RE);
  if (fromUrl) return { token: fromUrl[1] };
  if (TOKEN_RE.test(s)) return { token: s };

  let c = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length === 7 && c.startsWith("CBX")) c = c.slice(3);
  if (c.length !== 4 || [...c].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return { code: CODE_PREFIX + c };
}

/** UTC instant of 00:00 IST on the IST calendar day containing `d`. */
export function istDayStart(d: Date): Date {
  const shifted = d.getTime() + IST_MS;
  return new Date(shifted - (shifted % DAY_MS) - IST_MS);
}

/** Extended bookings and membership holds span whole IST days. */
export const isMultiDay = (startAt: Date, endAt: Date) =>
  endAt.getTime() - startAt.getTime() >= DAY_MS;

export type TicketPhase =
  | "not_confirmed"
  | "cancelled"
  | "other_day"
  | "too_early"
  | "valid_now"
  | "ended";

export type TicketBooking = {
  status: "active" | "cancelled";
  confirmed: boolean;
  startAt: Date;
  endAt: Date;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  openHour: number;
  closeHour: number;
};

export type TicketState = {
  phase: TicketPhase;
  multiDay: boolean;
  /** Earliest allowed check-in for the relevant day. */
  windowStart: Date;
  windowEnd: Date;
  /** Only today's (IST) stamps count — a multi-day booking starts fresh daily. */
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
};

export function ticketState(b: TicketBooking, now: Date): TicketState {
  const today = istDayStart(now);
  const multiDay = isMultiDay(b.startAt, b.endAt);
  const early = EARLY_CHECKIN_MIN * 60_000;

  const windowStart = multiDay
    ? new Date(today.getTime() + b.openHour * HOUR_MS - early)
    : new Date(b.startAt.getTime() - early);
  const windowEnd = multiDay
    ? new Date(today.getTime() + b.closeHour * HOUR_MS)
    : b.endAt;

  // Multi-day passes start fresh each IST day; a single booking (even one that
  // runs past midnight) keeps its stamps for its whole window.
  const todays = (d: Date | null) => (!multiDay || (d && d >= today) ? d : null);

  const phase = ((): TicketPhase => {
    if (b.status === "cancelled") return "cancelled";
    if (!b.confirmed) return "not_confirmed";
    if (multiDay) {
      const lastDay = istDayStart(new Date(b.endAt.getTime() - 1));
      if (now.getTime() >= lastDay.getTime() + b.closeHour * HOUR_MS) return "ended";
      if (now < b.startAt) return "other_day";
    } else {
      if (now >= b.endAt) return "ended";
      if (now < windowStart && istDayStart(b.startAt).getTime() !== today.getTime()) {
        return "other_day";
      }
    }
    if (now < windowStart) return "too_early";
    if (now >= windowEnd) return "ended";
    return "valid_now";
  })();

  return {
    phase,
    multiDay,
    windowStart,
    windowEnd,
    checkedInAt: todays(b.checkedInAt),
    checkedOutAt: todays(b.checkedOutAt),
  };
}
