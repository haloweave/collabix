import { beforeEach, describe, expect, test } from "vitest";
import {
  deleteDocument,
  getDocument,
  kycStatusOf,
  listDocuments,
  reviewDocument,
  safeFileName,
  saveDocument,
  sniffContentType,
} from "../lib/domain/documents";
import { MAX_DOC_BYTES } from "../lib/document-labels";
import { setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const USER = "user-docs-1";

beforeEach(async () => {
  await ctx.client`TRUNCATE TABLE "member_document"`;
});

const upload = (content: Buffer, extra: Partial<Parameters<typeof saveDocument>[1]> = {}) =>
  saveDocument(ctx.db, { userId: USER, docType: "aadhaar", fileName: "aadhaar.pdf", content, uploadedBy: "member", ...extra });

describe("file checks", () => {
  test("detects the real type from magic bytes", () => {
    expect(sniffContentType(PDF)).toBe("application/pdf");
    expect(sniffContentType(PNG)).toBe("image/png");
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffContentType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });

  test("cleans file names for headers", () => {
    expect(safeFileName('my "id"\r\n.pdf')).toBe("my _id_.pdf");
    expect(safeFileName("")).toBe("document");
  });
});

describe("member documents", () => {
  test("stores a valid upload with its sniffed type; lists without content", async () => {
    const res = await upload(PDF, { fileName: "card.png" });
    expect(res.ok).toBe(true);
    const [doc] = await listDocuments(ctx.db, USER);
    expect(doc).toMatchObject({ docType: "aadhaar", contentType: "application/pdf", status: "pending", sizeBytes: PDF.length });
    expect("content" in doc).toBe(false);
    if (res.ok) expect((await getDocument(ctx.db, res.id))?.content.equals(PDF)).toBe(true);
  });

  test("refuses unknown types, non-documents, empty and oversized files", async () => {
    expect(await upload(PDF, { docType: "selfie" })).toEqual({ ok: false, error: "bad_type" });
    expect(await upload(Buffer.from("MZ executable"))).toEqual({ ok: false, error: "bad_file" });
    expect(await upload(Buffer.alloc(0))).toEqual({ ok: false, error: "empty" });
    expect(await upload(Buffer.concat([PDF, Buffer.alloc(MAX_DOC_BYTES)]))).toEqual({ ok: false, error: "too_large" });
  });

  test("review sets the overall KYC status", async () => {
    const a = await upload(PDF);
    expect(kycStatusOf(await listDocuments(ctx.db, USER))).toBe("pending");
    if (!a.ok) throw new Error();
    await reviewDocument(ctx.db, { id: a.id, status: "rejected", note: "blurry", by: "staff@x" });
    expect(kycStatusOf(await listDocuments(ctx.db, USER))).toBe("rejected");
    await reviewDocument(ctx.db, { id: a.id, status: "verified", by: "staff@x" });
    const [doc] = await listDocuments(ctx.db, USER);
    expect(doc).toMatchObject({ status: "verified", reviewedBy: "staff@x" });
    expect(kycStatusOf([doc])).toBe("verified");
  });

  test("a member deletes only their own unverified documents; staff may delete any", async () => {
    const a = await upload(PDF);
    if (!a.ok) throw new Error();
    expect(await deleteDocument(ctx.db, { id: a.id, ownerId: "someone-else" })).toBe(false);
    await reviewDocument(ctx.db, { id: a.id, status: "verified", by: "s" });
    expect(await deleteDocument(ctx.db, { id: a.id, ownerId: USER })).toBe(false);
    expect(await deleteDocument(ctx.db, { id: a.id })).toBe(true);
    expect(await listDocuments(ctx.db, USER)).toHaveLength(0);
  });
});
