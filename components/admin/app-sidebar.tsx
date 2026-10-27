"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  CalendarRange,
  Users,
  Armchair,
  Ticket,
  BarChart3,
  ScrollText,
  UserCheck,
  BadgeCheck,
  Settings,
  LogOut,
  ScanLine,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const NAV = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true, group: "Front desk" },
  { title: "Reception", href: "/admin/reception", icon: UserCheck, group: "Front desk" },
  { title: "Scan ticket", href: "/admin/scan", icon: ScanLine, group: "Front desk" },
  { title: "Bookings", href: "/admin/bookings", icon: CalendarCheck, group: "Operations" },
  { title: "Calendar", href: "/admin/calendar", icon: CalendarRange, group: "Operations" },
  { title: "Members", href: "/admin/members", icon: Users, group: "Operations" },
  { title: "Memberships", href: "/admin/memberships", icon: BadgeCheck, group: "Operations" },
  { title: "Coupons", href: "/admin/coupons", icon: Ticket, group: "Operations" },
  { title: "Inventory", href: "/admin/inventory", icon: Armchair, group: "Operations" },
  { title: "Reports", href: "/admin/reports", icon: BarChart3, managerOnly: true, group: "Management" },
  { title: "Audit log", href: "/admin/audit", icon: ScrollText, managerOnly: true, group: "Management" },
  { title: "Settings", href: "/admin/settings", icon: Settings, managerOnly: true, group: "Management" },
];
const GROUPS = ["Front desk", "Operations", "Management"];

// Active item: lifted navy, gold icon, and a gold bar on the left edge.
const ITEM =
  "relative h-8 text-sidebar-foreground [&>svg]:text-sidebar-foreground/55 hover:[&>svg]:text-sidebar-primary data-[active=true]:[&>svg]:text-sidebar-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-primary before:opacity-0 data-[active=true]:before:opacity-100";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppSidebar({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isManager = user.role === "manager" || user.role === "owner";

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar>
      {/* Logo and an "Admin" badge on one line, so the menu starts high. */}
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <Link href="/admin" aria-label="Collabix admin home" className="flex items-center gap-2.5">
          <Image
            src="/collabix/img/logo-white.png"
            alt="Collabix — Work Lounge"
            width={3088}
            height={852}
            sizes="140px"
            className="h-7 w-auto"
            priority
          />
          <span className="font-mono text-[0.6rem] uppercase leading-none tracking-[0.24em] text-sidebar-primary">
            Admin
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1">
        {GROUPS.map((group) => {
          const items = NAV.filter(
            (item) => item.group === group && (!item.managerOnly || isManager),
          );
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group} className="py-1">
              <SidebarGroupLabel className="h-6 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-sidebar-foreground/45">
                {group}
              </SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={ITEM}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
                      {user.name}
                    </span>
                    <span className="truncate text-xs capitalize text-sidebar-foreground/60">
                      {user.role}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-medium">{user.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
