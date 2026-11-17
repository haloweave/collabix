// Identity / KYC documents. Files live in the member_document table (never a
// public bucket). The type of every upload is checked from its first bytes,
// not the browser's say-so, so a renamed script can't pose as a PDF.

import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import { DOC_TYPES, MAX_DOC_BYTES, type KycStatus } from "../document-labels";
import type { Db } from "./reservations";

/** Detect the real file type from its magic bytes. */
export function sniffContentType(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  return null;
}

/** A filename safe to echo in a Content-Disposition header. */
export function safeFileName(name: string): string {
  const clean = name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 100);
  return clean || "document";
}

export type DocumentMeta = Omit<typeof schema.memberDocument.$inferSelect, "content">;

const META = {
  id: schema.memberDocument.id,
  userId: schema.memberDocument.userId,
  docType: schema.memberDocument.docType,
  fileName: schema.memberDocument.fileName,
  contentType: schema.memberDocument.contentType,
  sizeBytes: schema.memberDocument.sizeBytes,
  status: schema.memberDocument.status,
  reviewNote: schema.memberDocument.reviewNote,
  reviewedBy: schema.memberDocument.reviewedBy,
  reviewedAt: schema.memberDocument.reviewedAt,
  uploadedBy: schema.memberDocument.uploadedBy,
  createdAt: schema.memberDocument.createdAt,
};

/** At most this many documents per member, to keep the table from becoming storage. */
export const MAX_DOCS_PER_MEMBER = 10;

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: "bad_type" | "too_large" | "empty" | "bad_file" | "too_many" };

export async function saveDocument(
  db: Db,
  input: { userId: string; docType: string; fileName: string; content: Buffer; uploadedBy: string },
): Promise<SaveResult> {
  if (!DOC_TYPES.some((d) => d.value === input.docType)) return { ok: false, error: "bad_type" };
  if (input.content.length === 0) return { ok: false, error: "empty" };
  if (input.content.length > MAX_DOC_BYTES) return { ok: false, error: "too_large" };
  const contentType = sniffContentType(input.content);
  if (!contentType) return { ok: false, error: "bad_file" };

  const existing = await db
    .select({ id: schema.memberDocument.id })
    .from(schema.memberDocument)
    .where(eq(schema.memberDocument.userId, input.userId));
  if (existing.length >= MAX_DOCS_PER_MEMBER) return { ok: false, error: "too_many" };

  const [row] = await db
    .insert(schema.memberDocument)
    .values({
      userId: input.userId,
      docType: input.docType,
      fileName: safeFileName(input.fileName),
      contentType,
      sizeBytes: input.content.length,
      content: input.content,
      uploadedBy: input.uploadedBy,
    })
    .returning({ id: schema.memberDocument.id });
  return { ok: true, id: row.id };
}

export async function listDocuments(db: Db, userId: string): Promise<DocumentMeta[]> {
  return db
    .select(META)
    .from(schema.memberDocument)
    .where(eq(schema.memberDocument.userId, userId))
    .orderBy(desc(schema.memberDocument.createdAt));
}

export async function getDocument(db: Db, id: string) {
  const [row] = await db.select().from(schema.memberDocument).where(eq(schema.memberDocument.id, id));
  return row ?? null;
}

export async function reviewDocument(
  db: Db,
  input: { id: string; status: "verified" | "rejected"; note?: string; by: string; now?: Date },
): Promise<boolean> {
  const rows = await db
    .update(schema.memberDocument)
    .set({
      status: input.status,
      reviewNote: input.note?.trim().slice(0, 200) || null,
      reviewedBy: input.by,
      reviewedAt: input.now ?? new Date(),
    })
    .where(eq(schema.memberDocument.id, input.id))
    .returning({ id: schema.memberDocument.id });
  return rows.length > 0;
}

/**
 * Delete a document. A member may remove only their own document, and only
 * before it was verified (a verified ID is part of the record staff rely on).
 */
export async function deleteDocument(
  db: Db,
  input: { id: string; ownerId?: string },
): Promise<boolean> {
  const where = input.ownerId
    ? and(
        eq(schema.memberDocument.id, input.id),
        eq(schema.memberDocument.userId, input.ownerId),
        inArray(schema.memberDocument.status, ["pending", "rejected"]),
      )
    : eq(schema.memberDocument.id, input.id);
  const rows = await db.delete(schema.memberDocument).where(where).returning({ id: schema.memberDocument.id });
  return rows.length > 0;
}

/** Overall ID status from a member's documents: any verified one wins. */
export function kycStatusOf(docs: Pick<DocumentMeta, "status">[]): KycStatus {
  if (docs.some((d) => d.status === "verified")) return "verified";
  if (docs.some((d) => d.status === "pending")) return "pending";
  if (docs.some((d) => d.status === "rejected")) return "rejected";
  return "none";
}
