// Identity / KYC document types and how they read. Client-safe.
export const DOC_TYPES = [
  { value: "aadhaar", label: "Aadhaar card" },
  { value: "pan", label: "PAN card" },
  { value: "passport", label: "Passport" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "voter_id", label: "Voter ID" },
  { value: "gst_certificate", label: "GST certificate" },
  { value: "company_id", label: "Company ID card" },
  { value: "other", label: "Other" },
] as const;
export type DocType = (typeof DOC_TYPES)[number]["value"];

export const docTypeLabel = (v: string) => DOC_TYPES.find((d) => d.value === v)?.label ?? v;

export type KycStatus = "verified" | "pending" | "rejected" | "none";
export const KYC_LABEL: Record<KycStatus, string> = {
  verified: "ID verified",
  pending: "ID awaiting review",
  rejected: "ID rejected",
  none: "No ID on file",
};

/** Largest accepted upload. Vercel caps a request body at 4.5 MB. */
export const MAX_DOC_BYTES = 4 * 1024 * 1024;
export const DOC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
