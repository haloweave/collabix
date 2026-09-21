"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { memberSignOut } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { title: "My bookings", href: "/account", exact: true },
  { title: "Invoices", href: "/account/invoices" },
  { title: "Profile", href: "/account/profile" },
];

export function PortalNav({ name }: { name: string }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <header className="sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
        <span className="text-sm font-semibold">Collabix</span>
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
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => memberSignOut())}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
