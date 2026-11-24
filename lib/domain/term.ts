import { GST_RATE, termMonthlyMinor, type TermPlan } from "../tariff";
import { IST_OFFSET_MIN, type Quote } from "./booking";

// Pure rules for monthly & annual passes — no database, no I/O. A term runs
// from 00:00 IST on its start date to 00:00 IST on the same date N months or
// years later, half-open, so back-to-back terms never overlap.

export type TermUnit = "month" | "year";
export type TermInput = { date: string; unit: TermUnit; count: number };
/** How many desks (desk plans) or cabins (cabin plans) one term holds. */
export type TermSpaces = { spaces?: number };

/** Monthly terms run 1–11 months; from 12 months it is an annual plan. */
export const MAX_MONTHS = 11;
export const MAX_YEARS = 3;
/** How far ahead a term may start. */
export const MAX_START_DAYS = 90;

const DAY_MS = 86_400_000;

function istToday(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** "2026-01-31" + 1 month → "2026-02-28": the day is clamped to the month's end. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

const istMidnight = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MIN * 60_000);

export const termMonths = (t: Pick<TermInput, "unit" | "count">) => (t.unit === "year" ? t.count * 12 : t.count);

export type TermWindow = {
  startDate: string;
  /** First day after the term (exclusive). */
  endDate: string;
  startAt: Date;
  endAt: Date;
};

/** The window a term covers, or why it can't be booked. */
export function termWindow(
  input: TermInput,
  now: Date,
): { ok: true; window: TermWindow } | { ok: false; error: string } {
  const { date, unit, count } = input;
  const max = unit === "year" ? MAX_YEARS : MAX_MONTHS;
  if (unit !== "month" && unit !== "year") return { ok: false, error: "unit must be month or year" };
  if (!Number.isInteger(count) || count < 1 || count > max) {
    return { ok: false, error: `a ${unit}ly term runs 1 to ${max} ${unit}s` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return { ok: false, error: "date must be YYYY-MM-DD" };
  }
  const today = istToday(now);
  if (date < today) return { ok: false, error: "date is in the past" };
  if (Date.parse(date) - Date.parse(today) > MAX_START_DAYS * DAY_MS) {
    return { ok: false, error: `a term starts within ${MAX_START_DAYS} days` };
  }
  const endDate = addMonths(date, termMonths(input));
  return {
    ok: true,
    window: { startDate: date, endDate, startAt: istMidnight(date), endAt: istMidnight(endDate) },
  };
}

/** One plan in a booking and how many of its desks or cabins are wanted. */
export type TermItem = { plan: TermPlan; spaces: number };

/** Server-computed price in integer paise for a mix of plans over one term:
 * the monthly rate per month, or the Annual tariff column per year, for each
 * desk or cabin, one line per plan, plus GST on the lot. */
export function priceTerms(
  items: TermItem[],
  input: Pick<TermInput, "unit" | "count">,
  now = new Date(),
  /** Per plan key, the spaces held ("Desks 07, 08"), named on that plan's line
   * so the invoice says what was booked. Estimates leave it out. */
  whereByPlan?: Record<string, string>,
): Quote {
  const { unit, count } = input;
  const lines = items.map(({ plan, spaces }) => {
    const unitMinor = unit === "year" ? plan.annualMinor : termMonthlyMinor(plan, now);
    const word = plan.space === "desk" ? "desks" : "cabins";
    const qty = count * spaces;
    return {
      label: `${plan.name} · ${unit === "year" ? "annual" : "monthly"}${spaces > 1 ? ` · ${spaces} ${word}` : ""}${
        whereByPlan?.[plan.key] ? ` · ${whereByPlan[plan.key]}` : ""
      }`,
      qty,
      unitMinor,
      amountMinor: unitMinor * qty,
    };
  });
  const subtotalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const taxMinor = Math.round(subtotalMinor * GST_RATE);
  return {
    productKey: items.map((i) => i.plan.key).join("+"),
    rateMinor: lines[0]?.unitMinor ?? 0,
    hours: 0,
    seats: items.reduce((sum, i) => sum + i.spaces, 0),
    months: termMonths(input),
    lines,
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
  };
}

/** The price of one plan: a single-line priceTerms. */
export function priceTerm(
  plan: TermPlan,
  input: Pick<TermInput, "unit" | "count"> & TermSpaces,
  now = new Date(),
): Quote {
  return priceTerms([{ plan, spaces: input.spaces ?? 1 }], input, now);
}
