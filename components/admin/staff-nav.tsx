"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { title: "Front desk", href: "/staff", exact: true },
  { title: "Book", href: "/staff/book" },
  { title: "Extended", href: "/staff/extended" },
  { title: "Members", href: "/staff/members" },
  { title: "Coupons", href: "/staff/coupons" },
];

export function StaffNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut().catch(() => {});
    router.push("/admin/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            C
          </div>
          <span className="text-sm font-semibold">Collabix Staff</span>
        </div>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = t.exact
              ? pathname === t.href
              : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.title}
              </Link>
            );
          })}
        </nav>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
