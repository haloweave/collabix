// Where a customer's booking stands, for the account page's labels and grouping.
// Client-safe and pure: the caller passes `now`.

export type BookingStage =
  | "awaiting-payment"
  | "today"
  | "upcoming"
  | "in-progress"
  | "completed"
  | "cancelled";

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** Whole IST calendar days from `now` to `at` (0 = today, 1 = tomorrow). */
export function istDaysUntil(at: Date, now: Date): number {
  const day = (d: Date) => Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
  return day(at) - day(now);
}

/**
 * null for a checkout that was abandoned (a hold that lapsed unpaid): it never
 * became a booking, so the account page leaves it out.
 */
export function bookingStage(
  b: {
    status: "active" | "cancelled";
    /** Holds confirmed seats now. */
    confirmed: boolean;
    /** Was confirmed at some point (it carries a ticket), even if since cancelled. */
    ticketed: boolean;
    /** An unpaid hold that has not lapsed yet. */
    pending: boolean;
    startAt: Date;
    endAt: Date;
  },
  now: Date,
): BookingStage | null {
  if (b.status === "cancelled") return b.ticketed ? "cancelled" : null;
  if (!b.confirmed) return b.pending ? "awaiting-payment" : null;
  if (now >= b.endAt) return "completed";
  if (now >= b.startAt) return "in-progress";
  return istDaysUntil(b.startAt, now) === 0 ? "today" : "upcoming";
}

/** "Today", "Tomorrow", "In 5 days", "On 12 Dec". */
export function relativeDay(at: Date, now: Date): string {
  const d = istDaysUntil(at, now);
  if (d <= 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 7) return `In ${d} days`;
  return `On ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(at)}`;
}
