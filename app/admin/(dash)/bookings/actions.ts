"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireStaff } from "@/lib/admin/auth";

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
