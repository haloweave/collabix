"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireStaff } from "@/lib/admin/auth";

// Take a seat offline / bring it back. A disabled resource drops out of
// availability and can't be held or booked; existing reservations are untouched.
export async function setResourceEnabled(id: string, enabled: boolean) {
  await requireStaff();
  await db
    .update(schema.resource)
    .set({ enabled })
    .where(eq(schema.resource.id, id));
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
}

// Adjust a resource's seat capacity (e.g. a cabin that fits an extra chair).
export async function setResourceCapacity(id: string, capacity: number) {
  await requireStaff();
  const cap = Math.max(1, Math.round(capacity));
  if (!Number.isFinite(cap)) throw new Error("invalid_capacity");
  await db
    .update(schema.resource)
    .set({ capacity: cap })
    .where(eq(schema.resource.id, id));
  revalidatePath("/admin/inventory");
}
