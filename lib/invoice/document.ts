// What an invoice says, independent of how it is drawn. Built from a booking's
// quote snapshot, frozen at checkout, so the invoice always matches the charge.

import { GST_RATE } from "../tariff";
import { PLACE_OF_SUPPLY, SAC_COWORKING } from "./seller";

export type InvoiceLine = {
  description: string;
  detail?: string;
  sac: string;
  qty: number;
  unitMinor: number;
  amountMinor: number;
};

export type InvoiceBuyer = {
  name: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  gstin?: string | null;
  address?: string | null;
};

export type InvoiceDoc = {
  number: string;
  issuedAt: Date;
  buyer: InvoiceBuyer;
  /** Label/value pairs printed beside the buyer (booking ref, period, …). */
  facts: [string, string][];
  lines: InvoiceLine[];
  subtotalMinor: number;
  /** Rate per half (CGST and SGST each), e.g. 9. */
  halfRatePercent: number;
  cgstMinor: number;
  sgstMinor: number;
  totalMinor: number;
  payment:
    | { status: "paid"; method?: string | null; reference?: string | null; paidAt?: Date | null }
    | { status: "due"; note: string };
  cancelled: boolean;
};

type SnapshotLine = { label: string; qty: number; unitMinor: number; amountMinor: number };

export type BookingInvoiceSource = {
  invoiceNo: string;
  invoicedAt: Date;
  status: "active" | "cancelled";
  buyer: InvoiceBuyer;
  plan: string | null;
  seats: number;
  ticketCode: string | null;
  /** Human service period, e.g. "1 Dec 2026 · 09:00–13:00 IST". */
  when: string;
  quote: Record<string, unknown>;
  payment: { method: string | null; reference: string | null; paidAt: Date | null } | null;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function isSnapshotLine(v: unknown): v is SnapshotLine {
  const l = v as SnapshotLine;
  return !!l && typeof l.label === "string" && typeof l.amountMinor === "number";
}

/** Split GST evenly into CGST and SGST; an odd paisa goes to SGST. */
export function splitGst(taxMinor: number) {
  const cgstMinor = Math.floor(taxMinor / 2);
  return { cgstMinor, sgstMinor: taxMinor - cgstMinor };
}

export function bookingInvoice(src: BookingInvoiceSource): InvoiceDoc {
  const q = src.quote;
  let totalMinor = num(q.totalMinor);
  let subtotalMinor = num(q.subtotalMinor);
  let taxMinor = num(q.taxMinor);
  // Staff-entered long stays store one all-in figure with no tax split; read it
  // as GST-inclusive so the invoice total still equals what was charged.
  if (taxMinor === 0 && totalMinor > 0) {
    subtotalMinor = Math.round(totalMinor / (1 + GST_RATE));
    taxMinor = totalMinor - subtotalMinor;
  }
  if (!totalMinor) totalMinor = subtotalMinor + taxMinor;

  const snapshot = Array.isArray(q.lines) ? q.lines.filter(isSnapshotLine) : [];
  const fromSnapshot = snapshot.length > 0 && snapshot.reduce((s, l) => s + l.amountMinor, 0) === subtotalMinor;
  const lines: InvoiceLine[] = fromSnapshot
    ? snapshot.map((l, i) => ({
        description: l.label,
        detail: i === 0 ? src.when : undefined,
        sac: SAC_COWORKING,
        qty: l.qty,
        unitMinor: l.unitMinor,
        amountMinor: l.amountMinor,
      }))
    : [
        {
          description: src.plan ?? "Workspace booking",
          detail: src.when,
          sac: SAC_COWORKING,
          qty: 1,
          unitMinor: subtotalMinor,
          amountMinor: subtotalMinor,
        },
      ];

  const facts: [string, string][] = [];
  if (src.ticketCode) facts.push(["Booking ref", src.ticketCode]);
  facts.push(["Service period", src.when]);
  facts.push(["Place of supply", PLACE_OF_SUPPLY]);

  return {
    number: src.invoiceNo,
    issuedAt: src.invoicedAt,
    buyer: src.buyer,
    facts,
    lines,
    subtotalMinor,
    halfRatePercent: (GST_RATE * 100) / 2,
    ...splitGst(taxMinor),
    totalMinor,
    payment: src.payment
      ? { status: "paid", ...src.payment }
      : { status: "due", note: "Settle at the Collabix front desk on your visit (ignore if already paid)" },
    cancelled: src.status === "cancelled",
  };
}
