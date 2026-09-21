"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireManager, requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";

export async function createMembershipPlan(input: {
  name: string;
  priceMinor: number;
  includedHours: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireManager();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Plan name is required." };
  const [row] = await db
    .insert(schema.membershipPlan)
    .values({
      name,
      priceMinor: Math.max(0, Math.round(input.priceMinor)),
      includedHours: Math.max(0, Math.round(input.includedHours)),
    })
    .returning({ id: schema.membershipPlan.id });
  await logAudit({
    action: "membership_plan.create",
    targetType: "membership_plan",
    targetId: row.id,
    detail: { name },
  });
  revalidatePath("/admin/memberships");
  return { ok: true };
}

export async function updateMembershipPlan(input: {
  id: string;
  priceMinor: number;
  includedHours: number;
  active: boolean;
}) {
  await requireManager();
  await db
    .update(schema.membershipPlan)
    .set({
      priceMinor: Math.max(0, Math.round(input.priceMinor)),
      includedHours: Math.max(0, Math.round(input.includedHours)),
      active: input.active,
    })
    .where(eq(schema.membershipPlan.id, input.id));
  await logAudit({
    action: "membership_plan.update",
    targetType: "membership_plan",
    targetId: input.id,
    detail: { priceMinor: input.priceMinor, active: input.active },
  });
  revalidatePath("/admin/memberships");
}

// Assign a plan to a member: cancel any current active subscription and start a
// fresh one-month period with a clean allowance.
export async function assignSubscription(memberId: string, planId: string) {
  await requireStaff();
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.memberSubscription)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.memberSubscription.memberId, memberId),
          eq(schema.memberSubscription.status, "active"),
        ),
      );
    await tx
      .insert(schema.memberSubscription)
      .values({ memberId, planId, periodEnd });
  });

  await logAudit({
    action: "subscription.assign",
    targetType: "member",
    targetId: memberId,
    detail: { planId },
  });
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/memberships");
}

export async function cancelSubscription(id: string, memberId: string) {
  await requireStaff();
  await db
    .update(schema.memberSubscription)
    .set({ status: "cancelled" })
    .where(eq(schema.memberSubscription.id, id));
  await logAudit({
    action: "subscription.cancel",
    targetType: "member",
    targetId: memberId,
    detail: { subscriptionId: id },
  });
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/memberships");
}
