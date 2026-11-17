// Dates of a repeating booking series. Pure and client-safe (the walk-in
// form previews the last date); holding them lives in lib/domain/recurring.ts.

export type RepeatEvery = "day" | "weekday" | "week";
export const REPEAT_EVERY: { value: RepeatEvery; label: string }[] = [
  { value: "day", label: "Every day" },
  { value: "weekday", label: "Every weekday (Mon–Fri)" },
  { value: "week", label: "Every week" },
];
export const MIN_OCCURRENCES = 2;
export const MAX_OCCURRENCES = 12;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat

/** The `count` dates of a series starting on `date` (included, even on a weekend). */
export function seriesDates(date: string, every: RepeatEvery, count: number): string[] {
  const out = [date];
  let cur = date;
  while (out.length < count) {
    cur = addDays(cur, every === "week" ? 7 : 1);
    if (every === "weekday" && (weekday(cur) === 0 || weekday(cur) === 6)) continue;
    out.push(cur);
  }
  return out;
}
