import type { DocumentItem } from "@/components/documents/document-panel";
import type { DocumentMeta } from "@/lib/domain/documents";

/** Only what the document panel shows: no staff emails, no owner id. */
export const toDocumentItem = (d: DocumentMeta): DocumentItem => ({
  id: d.id,
  docType: d.docType,
  fileName: d.fileName,
  sizeBytes: d.sizeBytes,
  status: d.status,
  reviewNote: d.reviewNote,
  createdAt: d.createdAt.toISOString(),
});
