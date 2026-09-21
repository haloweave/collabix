"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser, requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";

// Stamp check-in on every not-yet-checked-in confirmed reservation of a booking.
export async function checkInBooking(bookingId: string) {
  await requireStaff();
  await db
    .update(schema.reservation)
    .set({ checkedInAt: sql`now()` })
    .where(
      and(
        eq(schema.reservation.bookingId, bookingId),
        eq(schema.reservation.status, "confirmed"),
        isNull(schema.reservation.checkedInAt),
      ),
    );
  await logAudit({
    action: "booking.check_in",
    targetType: "booking",
    targetId: bookingId,
  });
  revalidatePath("/admin/reception");
}

export async function checkOutBooking(bookingId: string) {
  await requireStaff();
  await db
    .update(schema.reservation)
    .set({ checkedOutAt: sql`now()` })
    .where(
      and(
        eq(schema.reservation.bookingId, bookingId),
        eq(schema.reservation.status, "confirmed"),
        isNull(schema.reservation.checkedOutAt),
      ),
    );
  await logAudit({
    action: "booking.check_out",
    targetType: "booking",
    targetId: bookingId,
  });
  revalidatePath("/admin/reception");
}

export type VisitorInput = {
  name: string;
  company?: string;
  host?: string;
  purpose?: string;
  phone?: string;
};

export async function signInVisitor(
  input: VisitorInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Visitor name is required." };

  const actor = await getSessionUser();
  const [row] = await db
    .insert(schema.visitor)
    .values({
      name,
      company: input.company?.trim() || null,
      host: input.host?.trim() || null,
      purpose: input.purpose?.trim() || null,
      phone: input.phone?.trim() || null,
      createdBy: actor?.email ?? "dev@local",
    })
    .returning({ id: schema.visitor.id });

  await logAudit({
    action: "visitor.sign_in",
    targetType: "visitor",
    targetId: row.id,
    detail: { name, host: input.host ?? null },
  });
  revalidatePath("/admin/reception");
  return { ok: true };
}

export async function signOutVisitor(id: string) {
  await requireStaff();
  await db
    .update(schema.visitor)
    .set({ checkedOutAt: sql`now()` })
    .where(
      and(eq(schema.visitor.id, id), isNull(schema.visitor.checkedOutAt)),
    );
  await logAudit({
    action: "visitor.sign_out",
    targetType: "visitor",
    targetId: id,
  });
  revalidatePath("/admin/reception");
}
