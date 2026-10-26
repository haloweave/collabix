import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Member portal session: the Better Auth session created by the phone-OTP
// checkout or the universal /login page. Any signed-in account may view its
// own bookings; staff roles simply also have their own dashboards.
export type MemberSession = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

export async function getMemberSession(): Promise<MemberSession | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    const u = session.user as {
      id: string;
      name: string;
      email: string;
      phoneNumber?: string | null;
      role?: string;
    };
    return { id: u.id, name: u.name, email: u.email, phone: u.phoneNumber ?? null, role: u.role ?? "member" };
  } catch {
    return null;
  }
}

export async function requireMember(): Promise<MemberSession> {
  const m = await getMemberSession();
  if (!m) redirect("/login");
  return m;
}
