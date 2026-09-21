import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as authSchema from "@/lib/db/auth-schema";

// Member portal session. Demo-only for now: a `member_id` cookie identifies the
// signed-in customer (no OTP). Swap for real phone-OTP later behind this same
// interface. MEMBER_COOKIE is read in server components; set/cleared only in
// server actions.
export const MEMBER_COOKIE = "member_id";

export type MemberSession = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

export async function getMemberSession(): Promise<MemberSession | null> {
  const store = await cookies();
  const id = store.get(MEMBER_COOKIE)?.value;
  if (!id) return null;
  const [u] = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.id, id));
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phoneNumber ?? null,
    role: u.role,
  };
}

export async function requireMember(): Promise<MemberSession> {
  const m = await getMemberSession();
  if (!m) redirect("/account/login");
  return m;
}
