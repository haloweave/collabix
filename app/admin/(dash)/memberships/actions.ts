"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import * as authSchema from "@/lib/db/auth-schema";
import { requireStaff, requireManager } from "@/lib/admin/auth";
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

// Create a long-term hold: reserve specific seats/rooms for a member across a
// date range. Written as a normal (confirmed) booking with a long window, so it
// blocks those resources on the public booking page via the same exclusion
// constraint. Priced as ₹0 here (covered by the membership fee) and flagged
// membershipHold so it's distinguishable from hourly bookings.
export async function createLongTermHold(input: {
  memberId: string;
  resourceCodes: string[];
  startDate: string;
  endDate: string;
}): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  await requireStaff();

  const codes = [
    ...new Set(input.resourceCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)),
  ];
  if (!codes.length) return { ok: false, error: "Enter at least one seat/room code." };
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(input.startDate) || !dateRe.test(input.endDate))
    return { ok: false, error: "Use YYYY-MM-DD dates." };
  if (input.endDate < input.startDate)
    return { ok: false, error: "End date is before start date." };

  const [sy, sm, sd] = input.startDate.split("-").map(Number);
  const [ey, em, ed] = input.endDate.split("-").map(Number);
  const startAt = new Date(Date.UTC(sy, sm - 1, sd) - 330 * 60_000);
  const endAt = new Date(Date.UTC(ey, em - 1, ed + 1) - 330 * 60_000); // inclusive end day

  const resources = await db
    .select()
    .from(schema.resource)
    .where(inArray(schema.resource.code, codes));
  if (resources.length !== codes.length)
    return { ok: false, error: "One or more codes were not found." };

  const [member] = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.id, input.memberId));
  if (!member) return { ok: false, error: "Member not found." };

  const plans = await db.select().from(schema.ratePlan);
  const planByKind = new Map(plans.map((p) => [p.appliesToKind, p.id]));
  if (resources.some((r) => !planByKind.has(r.kind)))
    return { ok: false, error: "No rate plan for a resource kind." };

  try {
    const bookingId = await db.transaction(async (tx) => {
      const [b] = await tx
        .insert(schema.booking)
        .values({
          memberId: input.memberId,
          customerName: member.name,
          customerEmail: member.email,
        })
        .returning({ id: schema.booking.id });
      await tx.insert(schema.reservation).values(
        resources.map((r) => ({
          bookingId: b.id,
          resourceId: r.id,
          ratePlanId: planByKind.get(r.kind)!,
          startAt,
          endAt,
          status: "confirmed" as const,
          quoteSnapshot: {
            membershipHold: true,
            startDate: input.startDate,
            endDate: input.endDate,
          },
        })),
      );
      return b.id;
    });

    await logAudit({
      action: "hold.create",
      targetType: "member",
      targetId: input.memberId,
      detail: { codes, startDate: input.startDate, endDate: input.endDate },
    });
    revalidatePath(`/admin/members/${input.memberId}`);
    return { ok: true, bookingId };
  } catch (e) {
    const code =
      (e as { code?: string; cause?: { code?: string } })?.code ??
      (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23P01")
      return { ok: false, error: "A seat/room is already booked in that range." };
    throw e;
  }
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
