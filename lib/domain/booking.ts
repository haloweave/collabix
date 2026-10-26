import {
  GST_RATE,
  NIGHT_FROM,
  NIGHT_SURCHARGE,
  NIGHT_UNTIL,
  productPriceMinor,
  type BookableProduct,
} from "../tariff";

// Pure booking rules — no database, no I/O. The server is authoritative for
// time windows and money; these functions are the single source of those rules.
//
// Collabix is a single location in Asia/Kolkata, which has no DST, so a fixed
// UTC+5:30 offset is exact. Revisit if the platform ever goes multi-timezone.

// Collabix is open 24/7: any whole-hour start, every day, and a booking may
// run past midnight.
export const OPEN_HOUR = 0;
export const CLOSE_HOUR = 24;
/** Hourly bookings run 1–12 whole hours. Kept under 24 so they never read as a
 * multi-day booking (see isMultiDay in ./ticket). */
export const MAX_DURATION = 12;
/** Quick-pick durations shown as buttons; any whole hour up to MAX_DURATION is valid. */
export const PRESET_DURATIONS = [1, 2, 4, 8] as const;
/** GST on every price, per the published tariff. */
export const TAX_RATE = GST_RATE;
export const IST_OFFSET_MIN = 330; // Asia/Kolkata = UTC+5:30, no DST.

export type WindowInput = { date: string; start: number; duration: number };
export type ValidationResult = { ok: true } | { ok: false; error: string };

/** Today's date in Asia/Kolkata as a YYYY-MM-DD string, for a given instant. */
function istDateString(now: Date): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function validateWindow(input: WindowInput, now: Date): ValidationResult {
  const { date, start, duration } = input;

  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION) {
    return { ok: false, error: `duration must be a whole number of hours from 1 to ${MAX_DURATION}` };
  }
  if (!Number.isInteger(start) || start < OPEN_HOUR || start >= CLOSE_HOUR) {
    return { ok: false, error: "start must be a whole hour from 0 to 23" };
  }
  if (date < istDateString(now)) {
    return { ok: false, error: "date is in the past" };
  }
  return { ok: true };
}

/** Convert an IST wall-clock window to half-open [startAt, endAt) UTC instants. */
export function toUtcWindow(input: WindowInput): { startAt: Date; endAt: Date } {
  const { date, start, duration } = input;
  const [y, m, d] = date.split("-").map(Number);
  // Date.UTC gives the instant for the given fields treated as UTC; subtract the
  // IST offset to turn IST wall-clock into the true UTC instant.
  const startMs = Date.UTC(y, m - 1, d, start, 0, 0) - IST_OFFSET_MIN * 60_000;
  const startAt = new Date(startMs);
  const endAt = new Date(startMs + duration * 3_600_000);
  return { startAt, endAt };
}

/** How many of the `duration` hours from `start` fall in the 20:00–07:00 window. */
export function nightHours(start: number, duration: number): number {
  let n = 0;
  for (let h = start; h < start + duration; h++) {
    const hour = h % 24;
    if (hour >= NIGHT_FROM || hour < NIGHT_UNTIL) n++;
  }
  return n;
}

export type QuoteLine = { label: string; qty: number; unitMinor: number; amountMinor: number };

export type Quote = {
  productKey: string;
  /** Unit price before any after-hours charge. Kept for existing snapshot readers. */
  rateMinor: number;
  hours: number;
  seats: number;
  lines: QuoteLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/** Server-computed price from the tariff, in integer paise. Passes are priced
 * per person; rooms per hour, with the after-hours charge on night hours. */
export function priceBooking(
  p: BookableProduct,
  window: WindowInput,
  people: number,
  now = new Date(),
): Quote {
  const unit = productPriceMinor(p, now);
  const line = (label: string, qty: number, unitMinor: number): QuoteLine => ({
    label,
    qty,
    unitMinor,
    amountMinor: qty * unitMinor,
  });
  let lines: QuoteLine[];
  let seats: number;
  if (p.kind === "pass") {
    seats = people;
    lines = [line(p.name, people, unit)];
  } else {
    seats = 1;
    const night = nightHours(window.start, window.duration);
    lines = [
      line(p.name, window.duration - night, unit),
      line(`${p.name} · after hours (+20%)`, night, Math.round(unit * (1 + NIGHT_SURCHARGE))),
    ].filter((l) => l.qty > 0);
  }
  const subtotalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const taxMinor = Math.round(subtotalMinor * GST_RATE);
  return {
    productKey: p.key,
    rateMinor: unit,
    hours: window.duration,
    seats,
    lines,
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
  };
}

/** Day passes cover the standard working day; a Half Day Pass is a 4-hour block inside it. */
export const PASS_DAY = { start: 8, end: 20 } as const;
export const HALF_DAY_HOURS = 4;

/** The booking window a product implies, or why the request can't be booked. */
export function productWindow(
  p: BookableProduct,
  input: { date: string; start?: number; duration?: number },
  now: Date,
): { ok: true; window: WindowInput } | { ok: false; error: string } {
  const window: WindowInput =
    p.key === "day-full"
      ? { date: input.date, start: PASS_DAY.start, duration: PASS_DAY.end - PASS_DAY.start }
      : p.key === "day-half"
        ? { date: input.date, start: input.start ?? NaN, duration: HALF_DAY_HOURS }
        : { date: input.date, start: input.start ?? NaN, duration: input.duration ?? NaN };

  const valid = validateWindow(window, now);
  if (!valid.ok) return valid;
  if (
    p.key === "day-half" &&
    (window.start < PASS_DAY.start || window.start + HALF_DAY_HOURS > PASS_DAY.end)
  ) {
    return { ok: false, error: "a half day starts between 08:00 and 16:00" };
  }

  // A Full Day Pass stays on sale until the day ends; anything else must not
  // start in the past.
  const { startAt, endAt } = toUtcWindow(window);
  const cutoff = p.key === "day-full" ? endAt : startAt;
  if (cutoff.getTime() <= now.getTime()) {
    return { ok: false, error: "that time has already passed" };
  }
  return { ok: true, window };
}
