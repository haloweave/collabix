import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Roles that unlock the /admin panel. `member` (the booking-flow default) is
// intentionally excluded.
export const STAFF_ROLES = ["staff", "manager", "owner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type Role = "member" | StaffRole;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

function isStaff(role: string | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

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
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isStaff(user.role)) redirect("/admin/login?error=forbidden");
  return user;
}
