"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import SiteShell from "@/components/site/site-shell";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      await authClient.signOut().catch(() => {});
      router.push("/login");
      router.refresh();
    });
  }

  // One compact header instead of a hero: who is signed in (and the way out)
  // on a single line, then the three sections as a switch. Each page keeps
  // its own title.
  return (
    <SiteShell minimal authed>
      <section className="section-ivory account-page">
        <div className="wrap">
          <div className="account-bar">
            <p>
              {name ? (
                <>
                  Signed in as <strong>{name}</strong>
                </>
              ) : (
                "Your account"
              )}
            </p>
            <button type="button" className="link-btn" disabled={pending} onClick={signOut}>
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </div>
          <nav className="account-tabs" aria-label="Account">
            {LINKS.map(([href, label]) => {
              const active = href === "/account" ? path === href : path.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined}>
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="portal-scope pt-6">{children}</div>
        </div>
      </section>
    </SiteShell>
  );
}
