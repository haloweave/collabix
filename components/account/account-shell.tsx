"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { memberSignOut } from "@/app/account/actions";

const LINKS: [string, string][] = [
  ["/account", "My bookings"],
  ["/account/invoices", "Invoices"],
  ["/account/profile", "Profile"],
];

export function AccountShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <div className="collabix-site min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy">
        <div className="wrap flex h-[68px] items-center justify-between gap-4">
          <Link href="/account" aria-label="Collabix account" className="shrink-0">
            <Image
              width={3088}
              height={852}
              className="h-[26px] w-auto"
              src="/collabix/img/logo-white.png"
              alt="Collabix — Work Lounge"
            />
          </Link>
          <nav className="flex items-center gap-4 sm:gap-6" aria-label="Account">
            {LINKS.map(([href, label]) => {
              const active = href === "/account" ? path === href : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm font-medium transition-colors ${
                    active ? "text-gold" : "text-ivory/70 hover:text-ivory"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            <button
              className="btn btn-ghost-light"
              disabled={pending}
              onClick={() => startTransition(() => memberSignOut())}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="page-hero">
          <div className="wrap">
            <span className="eyebrow">Your account</span>
            <h1>My account</h1>
            {name && (
              <p className="lead" style={{ marginTop: ".6rem", color: "rgba(247,245,242,.7)" }}>
                Signed in as {name}
              </p>
            )}
          </div>
        </section>
        <section className="pad-sm section-ivory">
          <div className="wrap portal-scope">{children}</div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-bottom">
            <span>
              COLLABIX © 2026 · Work Lounge · Banaswadi, Bengaluru
            </span>
            <span>Identity by Haloweave · Demo site</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
