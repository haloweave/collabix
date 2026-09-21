"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";

// Update a rate plan's price and active flag. rateMinor is integer paise/hour;
// new bookings quote against this immediately (the quote is server-computed from
// the live rate_plan row), so a change here needs no deploy. Existing bookings
// keep their frozen quote_snapshot and are unaffected.
export async function updateRatePlan(input: {
  id: string;
  rateMinor: number;
  active: boolean;
}) {
  await requireStaff();

  const rateMinor = Math.max(0, Math.round(input.rateMinor));
  if (!Number.isFinite(rateMinor)) throw new Error("invalid_rate");

  await db
    .update(schema.ratePlan)
    .set({ rateMinor, active: input.active })
    .where(eq(schema.ratePlan.id, input.id));

  await logAudit({
    action: "rate_plan.update",
    targetType: "rate_plan",
    targetId: input.id,
    detail: { rateMinor, active: input.active },
  });

  revalidatePath("/admin/rate-plans");
}
