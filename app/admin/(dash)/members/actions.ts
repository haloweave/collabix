"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as authSchema from "@/lib/db/auth-schema";
import { requireManager, requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { toAccountPhone } from "@/lib/admin/member-lookup";

const ROLES = ["member", "reception", "staff", "manager", "owner"] as const;
type AssignableRole = (typeof ROLES)[number];

export type CreateMemberResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Create a member record (no invite email — they can OTP-sign-in later).
export async function createMember(input: {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  notes?: string;
}): Promise<CreateMemberResult> {
  await requireStaff();

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) return { ok: false, error: "Name and email are required." };
  const role: AssignableRole = ROLES.includes(input.role as AssignableRole)
    ? (input.role as AssignableRole)
    : "member";
  // Granting manager/owner at creation is a privileged act.
  if (role === "manager" || role === "owner") await requireManager();

  // Stored as the phone sign-in stores it (+91…), so the member can sign in
  // with it; one account per number.
  const phone = input.phone?.trim() ? toAccountPhone(input.phone) : null;
  if (input.phone?.trim() && !phone) return { ok: false, error: "Enter a valid 10-digit mobile number." };
  if (phone) {
    const [taken] = await db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.phoneNumber, phone));
    if (taken) return { ok: false, error: "An account with that mobile number exists." };
  }

  const [existing] = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email));
  if (existing) return { ok: false, error: "An account with that email exists." };

  const id = randomUUID();
  await db.insert(authSchema.user).values({
    id,
    name,
    email,
    emailVerified: false,
    phoneNumber: phone,
    role,
    notes: input.notes?.trim() || null,
  });

  await logAudit({
    action: "member.create",
    targetType: "member",
    targetId: id,
    detail: { email, role },
  });
  revalidatePath("/admin/members");
  return { ok: true, id };
}

export async function updateMemberNotes(id: string, notes: string) {
  await requireStaff();
  await db
    .update(authSchema.user)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(eq(authSchema.user.id, id));
  await logAudit({
    action: "member.update_notes",
    targetType: "member",
    targetId: id,
  });
  revalidatePath(`/admin/members/${id}`);
}

// Role changes are sensitive → manager/owner only.
export async function updateMemberRole(id: string, role: string) {
  await requireManager();
  if (!ROLES.includes(role as AssignableRole)) throw new Error("invalid_role");
  await db
    .update(authSchema.user)
    .set({ role, updatedAt: new Date() })
    .where(eq(authSchema.user.id, id));
  await logAudit({
    action: "member.update_role",
    targetType: "member",
    targetId: id,
    detail: { role },
  });
  revalidatePath(`/admin/members/${id}`);
  revalidatePath("/admin/members");
}
