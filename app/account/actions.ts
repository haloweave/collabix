"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, sql } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import * as authSchema from "@/lib/db/auth-schema";
import { MEMBER_COOKIE, getMemberSession } from "@/lib/account/auth";

// Demo login: find-or-create a member by phone and set the session cookie. No
// OTP — any number works (a known number maps to that customer's bookings).
export async function demoMemberLogin(phone: string) {
  const p = phone.trim();

  let user = p
    ? (
        await db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.phoneNumber, p))
      )[0]
    : undefined;

  if (!user) {
    const id = randomUUID();
    await db.insert(authSchema.user).values({
      id,
      name: p || "Guest",
      email: `${id}@demo.local`,
      phoneNumber: p || null,
      role: "member",
      emailVerified: false,
    });
    user = (
      await db.select().from(authSchema.user).where(eq(authSchema.user.id, id))
    )[0];
  }

  const store = await cookies();
  store.set(MEMBER_COOKIE, user!.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/account");
}

export async function memberSignOut() {
  const store = await cookies();
  store.delete(MEMBER_COOKIE);
  redirect("/account/login");
}

export async function updateOwnProfile(name: string) {
  const m = await getMemberSession();
  if (!m) redirect("/account/login");
  const clean = name.trim();
  if (!clean) return;
  await db
    .update(authSchema.user)
    .set({ name: clean, updatedAt: new Date() })
    .where(eq(authSchema.user.id, m.id));
  revalidatePath("/account/profile");
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
