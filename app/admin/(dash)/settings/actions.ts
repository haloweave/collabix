"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireManager } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";

export type SaveSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveSettings(input: {
  openHour: number;
  closeHour: number;
  timezone: string;
  closedDates: string[];
}): Promise<SaveSettingsResult> {
  await requireManager();

  const openHour = Math.round(input.openHour);
  const closeHour = Math.round(input.closeHour);
  if (openHour < 0 || openHour > 23 || closeHour < 1 || closeHour > 24)
    return { ok: false, error: "Hours must be within 0–24." };
  if (closeHour <= openHour)
    return { ok: false, error: "Closing hour must be after opening hour." };

  const closedDates = input.closedDates
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  const values = {
    id: 1,
    openHour,
    closeHour,
    timezone: input.timezone.trim() || "Asia/Kolkata",
    closedDates,
  };

  await db
    .insert(schema.settings)
    .values(values)
    .onConflictDoUpdate({ target: schema.settings.id, set: values });

  await logAudit({ action: "settings.update", targetType: "settings", detail: values });
  revalidatePath("/admin/settings");
  return { ok: true };
}
