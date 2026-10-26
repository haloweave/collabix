// Pure booking rules — no database, no I/O. The server is authoritative for
// time windows and money; these functions are the single source of those rules.
//
// Collabix is a single location in Asia/Kolkata, which has no DST, so a fixed
// UTC+5:30 offset is exact. Revisit if the platform ever goes multi-timezone.

export const OPEN_HOUR = 8; // 08:00 IST, first bookable start
export const CLOSE_HOUR = 20; // 20:00 IST, latest bookable end
/** Bookings are whole hours, from 1 up to the full open window (12 hours). */
export const MAX_DURATION = CLOSE_HOUR - OPEN_HOUR;
/** Quick-pick durations shown as buttons; any whole hour up to MAX_DURATION is valid. */
export const PRESET_DURATIONS = [1, 2, 4, 8] as const;
export const TAX_RATE = 0.18; // GST at 18%, per the published Collabix tariff.
export const IST_OFFSET_MIN = 330; // Asia/Kolkata = UTC+5:30, no DST.

export type WindowInput = { date: string; start: number; duration: number };
export type ValidationResult = { ok: true } | { ok: false; error: string };

/** Today's date in Asia/Kolkata as a YYYY-MM-DD string, for a given instant. */
function istDateString(now: Date): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function validateWindow(
  input: WindowInput,
  now: Date,
  bounds?: { openHour?: number; closeHour?: number },
): ValidationResult {
  const { date, start, duration } = input;
  const openHour = bounds?.openHour ?? OPEN_HOUR;
  const closeHour = bounds?.closeHour ?? CLOSE_HOUR;

  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION) {
    return { ok: false, error: `duration must be a whole number of hours from 1 to ${MAX_DURATION}` };
  }
  if (!Number.isInteger(start) || start < openHour) {
    return { ok: false, error: `start must be at or after ${openHour}:00` };
  }
  if (start + duration > closeHour) {
    return { ok: false, error: `booking must end by ${closeHour}:00` };
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

export type Quote = {
  rateMinor: number;
  hours: number;
  seats: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/** Server-computed price in integer minor units (paise). Never trust the client. */
export function computeQuote(
  rateMinor: number,
  hours: number,
  seats = 1,
  taxRate = TAX_RATE,
): Quote {
  const subtotalMinor = rateMinor * hours * seats;
  const taxMinor = Math.round(subtotalMinor * taxRate);
  return {
    rateMinor,
    hours,
    seats,
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
  };
}
