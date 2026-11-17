"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileText, Trash2, Upload, X } from "lucide-react";
import { DOC_ACCEPT, DOC_TYPES, docTypeLabel } from "@/lib/document-labels";
import { deleteMyDocument } from "@/app/account/actions";
import { deleteMemberDocument, reviewMemberDocument } from "@/app/admin/(dash)/members/actions";
import { cn } from "@/lib/utils";

export type DocumentItem = {
  id: string;
  docType: string;
  fileName: string;
  sizeBytes: number;
  status: string;
  reviewNote: string | null;
  createdAt: string;
};

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Awaiting review", className: "bg-amber-100 text-amber-900" },
  verified: { label: "Verified", className: "bg-emerald-100 text-emerald-900" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700" },
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * ID / KYC documents with an upload form. `mode="member"` is the customer's
 * own view; `mode="staff"` adds verify / reject and (for managers) delete.
 */
export function DocumentPanel({
  docs,
  mode,
  memberId,
  canDelete = false,
}: {
  docs: DocumentItem[];
  mode: "member" | "staff";
  /** Staff mode: the member the documents belong to. */
  memberId?: string;
  /** Staff mode: managers may delete. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>("aadhaar");
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a file first.");
      return;
    }
    const body = new FormData();
    body.set("file", file);
    body.set("docType", docType);
    if (mode === "staff" && memberId) body.set("userId", memberId);
    setUploading(true);
    try {
      const r = await fetch("/api/documents", { method: "POST", body });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(data.error ?? "Upload failed. Please try again.");
        return;
      }
      toast.success("Document uploaded.");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "That didn't work. Please refresh and try again.");
      else {
        toast.success(done);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {docs.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {docs.map((d) => {
            const s = STATUS[d.status] ?? STATUS.pending;
            const canRemove = mode === "member" ? d.status !== "verified" : canDelete;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {docTypeLabel(d.docType)}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.fileName} · {kb(d.sizeBytes)} · {new Date(d.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                    {d.reviewNote ? ` · ${d.reviewNote}` : ""}
                  </p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", s.className)}>
                  {s.label}
                </span>
                <div className="flex items-center gap-1">
                  {mode === "staff" && memberId && d.status !== "verified" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        act(() => reviewMemberDocument({ memberId, documentId: d.id, status: "verified" }), "Marked verified.")
                      }
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <Check className="size-3.5" /> Verify
                    </button>
                  )}
                  {mode === "staff" && memberId && d.status !== "rejected" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        const note = window.prompt("Why is it rejected? The member sees this.", "Not readable");
                        if (note === null) return;
                        act(
                          () => reviewMemberDocument({ memberId, documentId: d.id, status: "rejected", note }),
                          "Marked rejected.",
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <X className="size-3.5" /> Reject
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      disabled={pending}
                      aria-label="Delete document"
                      onClick={() => {
                        if (!window.confirm("Delete this document for good?")) return;
                        act(
                          () => (mode === "member" ? deleteMyDocument(d.id) : deleteMemberDocument(memberId!, d.id)),
                          "Document deleted.",
                        );
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={upload} className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Document</span>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-muted-foreground">File (PDF or photo, up to 4 MB)</span>
          <input ref={fileRef} type="file" accept={DOC_ACCEPT} className="min-w-0 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5" />
        </label>
        <button
          type="submit"
          disabled={uploading}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Upload className="size-4" />
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
    </div>
  );
}
