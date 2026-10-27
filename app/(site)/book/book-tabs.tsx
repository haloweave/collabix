import Link from "next/link";
import { TERM_PLANS, money, termMonthlyMinor } from "@/lib/tariff";

/** The two ways to book: by the day or hour, or for whole months and years. */
export function BookTabs({ current }: { current: "day" | "term" }) {
  const tabs = [
    { id: "day", href: "/book", label: "Day passes & meeting rooms", short: "Day & hourly" },
    { id: "term", href: "/book/passes", label: "Monthly & annual passes", short: "Monthly & annual" },
  ] as const;
  return (
    <nav className="book-tabs" aria-label="Booking type">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === current ? "page" : undefined}>
          <span className="bt-long">{t.label}</span>
          <span className="bt-short" aria-hidden="true">{t.short}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Points day bookers at the monthly and annual passes. */
export function PassesBanner() {
  const from = Math.min(...TERM_PLANS.map((p) => termMonthlyMinor(p)));
  return (
    <Link href="/book/passes" className="passes-banner">
      <span>
        <strong>Get monthly or annual passes.</strong> Your own desk or a private cabin
        for months or years, from {money(from / 100)}/month.
      </span>
      <span className="arw" aria-hidden="true">→</span>
    </Link>
  );
}
