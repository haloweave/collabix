"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import SiteShell from "@/components/site/site-shell";
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
    <SiteShell minimal>
      <section className="page-hero account-hero">
        <div className="glow" />
        <div className="wrap">
          <span className="eyebrow">Your account</span>
          <h1>My account</h1>
          {name && (
            <p className="lead" style={{ marginTop: ".35rem", color: "rgba(247,245,242,.7)" }}>
              Signed in as {name}
            </p>
          )}
        </div>
      </section>

      <section className="pad-sm section-ivory">
        <div className="wrap">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-navy/10 pb-4">
            <nav className="flex items-center gap-5 sm:gap-7" aria-label="Account">
              {LINKS.map(([href, label]) => {
                const active =
                  href === "/account" ? path === href : path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`text-sm font-medium transition-colors ${
                      active ? "text-gold" : "text-navy/60 hover:text-navy"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
            <button
              className="btn btn-navy"
              disabled={pending}
              onClick={() => startTransition(() => memberSignOut())}
            >
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </div>
          <div className="portal-scope">{children}</div>
        </div>
      </section>
    </SiteShell>
  );
}
