"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarPlus,
  CalendarRange,
  ConciergeBell,
  LogOut,
  ScanLine,
  TicketPercent,
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const TABS = [
  { title: "Scan", href: "/staff/scan", icon: ScanLine },
  { title: "Front desk", short: "Desk", href: "/staff", exact: true, icon: ConciergeBell },
  { title: "Book", href: "/staff/book", icon: CalendarPlus },
  { title: "Extended", href: "/staff/extended", icon: CalendarRange },
  { title: "Members", href: "/staff/members", icon: Users },
  { title: "Coupons", href: "/staff/coupons", icon: TicketPercent },
];

export function StaffNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut().catch(() => {});
    router.push("/login");
  }

  const isActive = (t: (typeof TABS)[number]) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href);

  // Wide screens: the tabs sit in the top bar. Phones: the top bar keeps the
  // logo and sign-out, and the tabs move to a bottom bar within thumb reach.
  return (
    <>
    <header className="sticky top-0 z-20 border-b border-gold/20 bg-navy/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
        <Link href="/staff" aria-label="Front desk home" className="flex shrink-0 items-center gap-3">
          <Image
            src="/collabix/img/logo-white.png"
            alt="Collabix — Work Lounge"
            width={3088}
            height={852}
            sizes="120px"
            className="h-7 w-auto"
            priority
          />
          <span className="hidden border-l border-ivory/20 pl-3 font-mono text-[0.6rem] uppercase tracking-[0.26em] text-gold sm:inline">
            Staff
          </span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {TABS.map((t) => {
            const active = isActive(t);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-gold text-navy"
                    : "text-ivory/70 hover:bg-white/5 hover:text-white",
                )}
              >
                {t.title}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={signOut}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ivory/70 transition-colors hover:text-gold"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
    <nav
      aria-label="Staff sections"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-gold/20 bg-navy/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {TABS.map((t) => {
        const active = isActive(t);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[0.65rem] font-medium transition-colors",
              active ? "text-gold" : "text-ivory/60 hover:text-white",
            )}
          >
            <Icon className="size-5" />
            {t.short ?? t.title}
          </Link>
        );
      })}
    </nav>
    </>
  );
}
