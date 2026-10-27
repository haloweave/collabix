"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

/** "/admin/bookings/abc" → "Bookings"; the bare /admin root is the dashboard. */
function section(pathname: string) {
  const seg = pathname.split("/")[2];
  if (!seg) return "Dashboard";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

export function AdminTopbar() {
  const pathname = usePathname();
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger className="-ml-1 text-primary" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
          Admin
        </span>
        <span className="text-gold" aria-hidden="true">/</span>
        <span className="truncate font-medium text-primary">{section(pathname)}</span>
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <span
          className="hidden font-mono text-xs text-muted-foreground sm:inline"
          suppressHydrationWarning
        >
          {today}
        </span>
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-gold"
        >
          View site <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}
