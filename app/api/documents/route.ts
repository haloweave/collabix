import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUser, isStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { saveDocument } from "@/lib/domain/documents";

const ERRORS: Record<string, string> = {
  bad_type: "Pick what kind of document this is.",
  too_large: "That file is over 4 MB. Try a smaller scan or photo.",
  empty: "That file is empty.",
  bad_file: "Upload a PDF, JPG, PNG or WebP file.",
  too_many: "There are already 10 documents on file. Remove one first.",
};

// Upload an ID / KYC document (multipart: file, docType, and userId when staff
// upload for a member). A member can only upload to their own record.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const docType = String(form?.get("docType") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });

  const forUser = String(form?.get("userId") ?? "") || user.id;
  const staffUpload = forUser !== user.id;
  if (staffUpload && !isStaff(user.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const res = await saveDocument(db, {
    userId: forUser,
    docType,
    fileName: file.name,
    content: Buffer.from(await file.arrayBuffer()),
    uploadedBy: staffUpload ? user.email : "member",
  });
  if (!res.ok) return NextResponse.json({ error: ERRORS[res.error] }, { status: 400 });

  if (staffUpload) {
    await logAudit({ action: "document.upload", targetType: "member", targetId: forUser, detail: { documentId: res.id, docType } });
  }
  return NextResponse.json({ ok: true, id: res.id });
}
