"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireStaff } from "@/lib/admin/auth";
import {
  confirmBooking,
  getAvailability,
  holdReservation,
} from "@/lib/domain/reservations";

// Cancel a whole booking: mark it cancelled and release every held/confirmed
// reservation under it (status='cancelled' drops out of the no-overlap
// exclusion constraint, freeing the seat for others). Expired/already-cancelled
// reservations are left untouched.
export async function cancelBooking(bookingId: string) {
  await requireStaff();

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

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
}

export type WalkInResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string };

// Staff-created (walk-in) booking: auto-pick the first N available seats for the
// window, hold them, and confirm immediately — same engine as the customer flow
// but without the OTP step. All-or-nothing on availability.
export async function createWalkIn(input: {
  planKey: string;
  date: string;
  start: number;
  duration: number;
  seats: number;
  customerName: string;
  customerEmail: string;
}): Promise<WalkInResult> {
  await requireStaff();

  const seats = Math.max(1, Math.min(20, Math.round(input.seats)));
  const window = {
    planKey: input.planKey,
    date: input.date,
    start: input.start,
    duration: input.duration,
  };

  let free;
  try {
    const avail = await getAvailability(db, window);
    free = avail.filter((a) => a.available).slice(0, seats);
  } catch {
    return { ok: false, error: "Invalid plan or window." };
  }
  if (free.length < seats) {
    return {
      ok: false,
      error: `Only ${free.length} seat(s) free for that window.`,
    };
  }

  const held = await holdReservation(db, {
    ...window,
    resourceIds: free.map((f) => f.resourceId),
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim().toLowerCase(),
    holdMinutes: 5,
  });
  if (!held.ok) return { ok: false, error: held.error };

  const confirmed = await confirmBooking(db, { bookingId: held.bookingId });
  if (!confirmed.ok) return { ok: false, error: confirmed.error };

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return { ok: true, bookingId: held.bookingId };
}
