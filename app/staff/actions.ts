"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";

// ── Coupons ────────────────────────────────────────────────────────────────
export async function createCoupon(input: {
  code: string;
  kind: "percent" | "flat";
  value: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a code." };
  if (input.kind === "percent" && (input.value <= 0 || input.value > 100))
    return { ok: false, error: "Percent must be 1–100." };
  if (input.value <= 0) return { ok: false, error: "Value must be positive." };

  try {
    await db
      .insert(schema.coupon)
      .values({ code, kind: input.kind, value: Math.round(input.value) });
  } catch {
    return { ok: false, error: "That code already exists." };
  }
  await logAudit({ action: "coupon.create", targetType: "coupon", detail: { code } });
  revalidatePath("/staff/coupons");
  revalidatePath("/admin/coupons");
  return { ok: true };
}

export async function toggleCoupon(id: string, active: boolean) {
  await requireStaff();
  await db.update(schema.coupon).set({ active }).where(eq(schema.coupon.id, id));
  await logAudit({ action: "coupon.toggle", targetType: "coupon", targetId: id, detail: { active } });
  revalidatePath("/staff/coupons");
  revalidatePath("/admin/coupons");
}

// ── Extended-period booking ─────────────────────────────────────────────────
// Reserve seats/rooms across a date range at a staff-set total (auto-computed on
// the client, editable). Confirmed booking with a long window blocks those
// resources on the public booking page.
export async function createExtendedBooking(input: {
  customerName: string;
  customerEmail: string;
  resourceCodes: string[];
  startDate: string;
  endDate: string;
  totalMinor: number;
}): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  await requireStaff();

  const codes = [
    ...new Set(input.resourceCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)),
  ];
  if (!input.customerName.trim() || !input.customerEmail.trim())
    return { ok: false, error: "Customer name and email are required." };
  if (!codes.length) return { ok: false, error: "Enter seat/room codes." };
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(input.startDate) || !dateRe.test(input.endDate))
    return { ok: false, error: "Use YYYY-MM-DD dates." };
  if (input.endDate < input.startDate)
    return { ok: false, error: "End date is before start date." };

  const [sy, sm, sd] = input.startDate.split("-").map(Number);
  const [ey, em, ed] = input.endDate.split("-").map(Number);
  const startAt = new Date(Date.UTC(sy, sm - 1, sd) - 330 * 60_000);
  const endAt = new Date(Date.UTC(ey, em - 1, ed + 1) - 330 * 60_000);

  const resources = await db
    .select()
    .from(schema.resource)
    .where(inArray(schema.resource.code, codes));
  if (resources.length !== codes.length)
    return { ok: false, error: "One or more codes were not found." };

  const plans = await db.select().from(schema.ratePlan);
  const planByKind = new Map(plans.map((p) => [p.appliesToKind, p.id]));
  if (resources.some((r) => !planByKind.has(r.kind)))
    return { ok: false, error: "No rate plan for a resource kind." };

  const totalMinor = Math.max(0, Math.round(input.totalMinor));

  try {
    const bookingId = await db.transaction(async (tx) => {
      const [b] = await tx
        .insert(schema.booking)
        .values({
          customerName: input.customerName.trim(),
          customerEmail: input.customerEmail.trim().toLowerCase(),
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
            extended: true,
            totalMinor,
            subtotalMinor: totalMinor,
            taxMinor: 0,
            startDate: input.startDate,
            endDate: input.endDate,
          },
        })),
      );
      return b.id;
    });

    await logAudit({
      action: "booking.extended",
      targetType: "booking",
      targetId: bookingId,
      detail: { codes, startDate: input.startDate, endDate: input.endDate, totalMinor },
    });
    revalidatePath("/admin/bookings");
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
