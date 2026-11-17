import { db } from "@/lib/db/client";
import { getSessionUser, isStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { getDocument } from "@/lib/domain/documents";

// Serve an ID document to its owner or to staff. Every staff view is written
// to the audit trail. Never cached, never sniffed, always a download-safe name.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return new Response("Not found", { status: 404 });
  const doc = /^[0-9a-f-]{36}$/i.test(id) ? await getDocument(db, id) : null;
  const owner = doc?.userId === user.id;
  if (!doc || (!owner && !isStaff(user.role))) return new Response("Not found", { status: 404 });

  if (!owner) {
    await logAudit({ action: "document.view", targetType: "member", targetId: doc.userId, detail: { documentId: doc.id } });
  }
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "content-type": doc.contentType,
      "content-length": String(doc.content.length),
      "content-disposition": `inline; filename="${doc.fileName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
