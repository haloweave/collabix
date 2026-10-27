import Link from "next/link";

/** The two ways to book: by the day or hour, or for whole months and years. */
export function BookTabs({ current }: { current: "day" | "term" }) {
  const tabs = [
    { id: "day", href: "/book", label: "Day passes & meeting rooms" },
    { id: "term", href: "/book/passes", label: "Monthly & annual passes" },
  ] as const;
  return (
    <nav className="book-tabs" aria-label="Booking type">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === current ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
