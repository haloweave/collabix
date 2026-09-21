import "server-only";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSessionUser } from "./auth";

// Append one row to the audit trail, snapshotting who did it. Called from every
// admin mutation. Best-effort: a logging failure must never break the action.
export async function logAudit(input: {
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: unknown;
}) {
  try {
    const user = await getSessionUser();
    await db.insert(schema.auditEvent).values({
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? "dev@local",
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      detail: (input.detail as object) ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to record", input.action, e);
  }
}
