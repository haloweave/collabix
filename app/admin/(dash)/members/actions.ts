"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as authSchema from "@/lib/db/auth-schema";
import { isManager, requireManager, requireStaff } from "@/lib/admin/auth";
import { addWalletEntry } from "@/lib/domain/wallet";
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

  // Members sign in by mobile only (staff use email and password), so a
  // member needs one, stored as the phone sign-in stores it (+91…).
  const phone = input.phone?.trim() ? toAccountPhone(input.phone) : null;
  if (input.phone?.trim() && !phone) return { ok: false, error: "Enter a valid 10-digit mobile number." };
  if (role === "member" && !phone) return { ok: false, error: "A member needs a mobile number to sign in." };
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

const WALLET_ERRORS: Record<string, string> = {
  bad_amount: "Enter an amount above zero (up to ₹2,00,000).",
  bad_method: "Pick how the customer paid.",
  would_go_negative: "That would take the balance below zero.",
};

/**
 * Add to (or correct) a member's wallet. Front-desk staff record top-ups they
 * took payment for; free credit and corrections are for managers only.
 */
export async function addWalletFunds(input: {
  memberId: string;
  kind: "topup" | "credit" | "adjust";
  amountRupees: number;
  method?: string;
  note?: string;
}): Promise<{ ok: true; balanceMinor: number } | { ok: false; error: string }> {
  const staff = await requireStaff();
  if (input.kind !== "topup" && !isManager(staff.role))
    return { ok: false, error: "Only a manager can give credit or correct a balance." };
  const res = await addWalletEntry(db, {
    userId: input.memberId,
    kind: input.kind,
    amountMinor: Math.round(input.amountRupees * 100),
    method: input.method,
    note: input.note,
    by: staff.email,
  });
  if (!res.ok) return { ok: false, error: WALLET_ERRORS[res.error] ?? "Could not update the wallet." };
  await logAudit({
    action: `wallet.${input.kind}`,
    targetType: "member",
    targetId: input.memberId,
    detail: { amountMinor: Math.round(input.amountRupees * 100), method: input.method ?? null, note: input.note?.trim() || null },
  });
  revalidatePath(`/admin/members/${input.memberId}`);
  return res;
}
