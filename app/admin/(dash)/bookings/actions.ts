"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { holdBody } from "@/lib/api/validation";
import {
  confirmBooking,
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

  await logAudit({
    action: "booking.cancel",
    targetType: "booking",
    targetId: bookingId,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
}

const WALK_IN_ERRORS: Record<string, string> = {
  not_enough_desks: "Not enough free desks for that day.",
  seat_unavailable: "That room is already booked for that time.",
  closed_date: "Collabix is closed on that date.",
};

export type WalkInResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string };

// Staff-created (walk-in) booking: auto-pick the first N available seats for the
// window, hold them, and confirm immediately — same engine as the customer flow
// but without the OTP step. All-or-nothing on availability.
export async function createWalkIn(input: {
  productKey: string;
  date: string;
  start?: number;
  duration?: number;
  people?: number;
  customerName: string;
  customerEmail: string;
}): Promise<WalkInResult> {
  await requireStaff();

  const parsed = holdBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the product, date, time and customer details." };

  const held = await holdReservation(db, {
    ...parsed.data,
    customerEmail: parsed.data.customerEmail.toLowerCase(),
    holdMinutes: 5,
  });
  if (!held.ok) return { ok: false, error: WALK_IN_ERRORS[held.error] ?? held.error };

  const confirmed = await confirmBooking(db, { bookingId: held.bookingId });
  if (!confirmed.ok) return { ok: false, error: confirmed.error };

  await logAudit({
    action: "booking.create_walkin",
    targetType: "booking",
    targetId: held.bookingId,
    detail: {
      productKey: parsed.data.productKey,
      people: parsed.data.people,
      date: parsed.data.date,
      start: parsed.data.start,
      duration: parsed.data.duration,
      totalMinor: held.quote.totalMinor,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return { ok: true, bookingId: held.bookingId };
}
