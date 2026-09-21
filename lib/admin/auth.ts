import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Roles that unlock the /admin panel. `member` (the booking-flow default) is
// intentionally excluded. `reception` is the limited front-desk role.
export const STAFF_ROLES = ["reception", "staff", "manager", "owner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Role = "member" | StaffRole;

// Config/finance roles: the only ones allowed on rate plans, reports, audit and
// the forthcoming settings/membership/billing pages. Reception/staff are bounced.
export const MANAGER_ROLES = ["manager", "owner"] as const;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

function isStaff(role: string | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isManager(role: string | undefined): boolean {
  return !!role && (MANAGER_ROLES as readonly string[]).includes(role);
}

/**
 * Dev escape hatch: when ADMIN_AUTH_DISABLED is set the whole /admin panel is
 * publicly visible with no sign-in. Off by default, so production (which won't
 * set the flag) stays guarded. Remove the flag from .env to re-enable auth.
 */
export function isAdminAuthDisabled(): boolean {
  const v = process.env.ADMIN_AUTH_DISABLED;
  return v === "1" || v === "true";
}

// The stand-in identity shown in the sidebar while auth is disabled.
const DEV_ADMIN: SessionUser = {
  id: "dev-admin",
  name: "Admin (dev)",
  email: "dev@local",
  role: "owner",
};

/** The current session user (or null), with the custom `role` field. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as { id: string; name: string; email: string; role?: string };
  return { id: u.id, name: u.name, email: u.email, role: (u.role as Role) ?? "member" };
}

/**
 * Guard for every admin route. Bounces anonymous visitors to the sign-in page
 * and non-staff accounts to the "no access" screen. Returns the staff user so
 * pages/layouts can greet them.
 */
export async function requireStaff(): Promise<SessionUser> {
  if (isAdminAuthDisabled()) {
    // Prefer a real signed-in staff session if there is one, otherwise let
    // anyone in as the dev admin.
    const user = await getSessionUser();
    return user && isStaff(user.role) ? user : DEV_ADMIN;
  }
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isStaff(user.role)) redirect("/admin/login?error=forbidden");
  return user;
}

/**
 * Guard for the /admin panel. The limited `reception` role is sent to its own
 * /staff console; staff/manager/owner get the full panel.
 */
export async function requireAdminAccess(): Promise<SessionUser> {
  if (isAdminAuthDisabled()) {
    const user = await getSessionUser();
    return user && isStaff(user.role) ? user : DEV_ADMIN;
  }
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isStaff(user.role)) redirect("/admin/login?error=forbidden");
  if (user.role === "reception") redirect("/staff");
  return user;
}

/**
 * Guard for config/finance pages. Anonymous → sign-in; operational-only roles
 * (reception/staff) are bounced to the dashboard rather than shown the page.
 */
export async function requireManager(): Promise<SessionUser> {
  if (isAdminAuthDisabled()) {
    const user = await getSessionUser();
    return user && isManager(user.role) ? user : DEV_ADMIN;
  }
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isStaff(user.role)) redirect("/admin/login?error=forbidden");
  if (!isManager(user.role)) redirect("/admin");
  return user;
}
