import Link from "next/link";
import { TERM_PLANS, money, termMonthlyMinor } from "@/lib/tariff";

/** The two ways to book: by the day or hour, or for whole months and years.
 * The term tab carries the lowest monthly price, so day bookers see the offer. */
export function BookTabs({ current }: { current: "day" | "term" }) {
  const from = Math.min(...TERM_PLANS.map((p) => termMonthlyMinor(p)));
  const tabs = [
    { id: "day", href: "/book", label: "Day passes & meeting rooms", short: "Day & hourly" },
    { id: "term", href: "/book/passes", label: "Monthly & annual passes", short: "Monthly & annual", from: `from ${money(from / 100)}/mo` },
  ] as const;
  return (
    <nav className="book-tabs" aria-label="Booking type">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === current ? "page" : undefined}>
          <span className="bt-long">{t.label}</span>
          <span className="bt-short" aria-hidden="true">{t.short}</span>
          {"from" in t && <span className="bt-from">{t.from}</span>}
        </Link>
      ))}
    </nav>
  );
}
