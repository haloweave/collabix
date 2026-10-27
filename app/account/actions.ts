"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, sql } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import * as authSchema from "@/lib/db/auth-schema";
import { getMemberSession } from "@/lib/account/auth";
import { isValidGstin, normalizeGstin } from "@/lib/invoice/gstin";

export async function updateOwnProfile(name: string) {
  const m = await getMemberSession();
  if (!m) redirect("/login");
  const clean = name.trim();
  if (!clean) return;
  await db
    .update(authSchema.user)
    .set({ name: clean, updatedAt: new Date() })
    .where(eq(authSchema.user.id, m.id));
  revalidatePath("/account/profile");
}

/** Save (or clear) the business details printed on the customer's invoices. */
export async function updateBillingProfile(input: {
  companyName: string;
  gstin: string;
  address: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await getMemberSession();
  if (!m) return { ok: false, error: "Not signed in." };

  const companyName = input.companyName.trim().slice(0, 120) || null;
  const address = input.address.trim().slice(0, 300) || null;
  const gstin = normalizeGstin(input.gstin) || null;
  if (gstin && !isValidGstin(gstin))
    return { ok: false, error: "That GSTIN doesn't look right. Check it against your certificate." };
  if (gstin && !companyName)
    return { ok: false, error: "Add the registered business name that goes with this GSTIN." };

  const values = { companyName, gstin, address, updatedAt: new Date() };
  await db
    .insert(schema.billingProfile)
    .values({ userId: m.id, ...values })
    .onConflictDoUpdate({ target: schema.billingProfile.userId, set: values });
  revalidatePath("/account/profile");
  return { ok: true };
}

export async function cancelOwnBooking(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await getMemberSession();
  if (!m) return { ok: false, error: "Not signed in." };

  const [b] = await sql`
    SELECT b.id, b.member_id, b.customer_email, min(r.start_at) AS start_at
    FROM booking b JOIN reservation r ON r.booking_id = b.id
    WHERE b.id = ${bookingId} AND b.status = 'active'
    GROUP BY b.id`;
  if (!b) return { ok: false, error: "Booking not found." };
  if (b.member_id !== m.id && b.customer_email !== m.email)
    return { ok: false, error: "That isn't your booking." };
  if (new Date(b.start_at as string) <= new Date())
    return { ok: false, error: "This booking has already started." };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.reservation)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.reservation.bookingId, bookingId),
          inArray(schema.reservation.status, ["held", "confirmed"]),
        ),
      );
    await tx
      .update(schema.booking)
      .set({ status: "cancelled" })
      .where(eq(schema.booking.id, bookingId));
  });

  revalidatePath("/account");
  return { ok: true };
}
