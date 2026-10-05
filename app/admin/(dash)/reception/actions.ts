"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser, requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { stampCheckIn, stampCheckOut } from "@/lib/domain/checkin";
import { scanTicketCore, type ScanOutcome } from "@/lib/domain/scan";

export type CheckInMethod = "scan" | "code" | "manual" | "override";

function revalidateFrontDesk() {
  revalidatePath("/admin/reception");
  revalidatePath("/staff");
}

// Manual front-desk check-in (reception board button). Day-aware: a multi-day
// booking can be checked in again on each day of its range.
export async function checkInBooking(bookingId: string) {
  await requireStaff();
  if (await stampCheckIn(db, bookingId)) {
    await logAudit({
      action: "booking.check_in",
      targetType: "booking",
      targetId: bookingId,
      detail: { method: "manual" satisfies CheckInMethod },
    });
  }
  revalidateFrontDesk();
}

export async function checkOutBooking(bookingId: string) {
  await requireStaff();
  if (await stampCheckOut(db, bookingId)) {
    await logAudit({
      action: "booking.check_out",
      targetType: "booking",
      targetId: bookingId,
    });
  }
  revalidateFrontDesk();
}

// Staff scan of a guest's e-ticket (QR URL, token, or typed backup code). A
// valid ticket is checked in as part of the scan.
export async function scanTicket(
  raw: string,
  opts?: { override?: boolean },
): Promise<ScanOutcome> {
  await requireStaff();
  const out = await scanTicketCore(db, raw, { override: opts?.override });
  if (out.kind === "ticket" && out.justCheckedIn) {
    await logAudit({
      action: "booking.check_in",
      targetType: "booking",
      targetId: out.view.bookingId,
      detail: { method: out.method },
    });
    revalidateFrontDesk();
  }
  return out;
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
