import "server-only";
import { sql } from "@/lib/db/client";
import { bookingInvoice, type InvoiceBuyer, type InvoiceDoc } from "@/lib/invoice/document";
import { ticketWhen } from "@/lib/domain/ticket-display";
import type { BillingSnapshot } from "@/lib/domain/invoice-number";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const n = (v: unknown) => Number(v ?? 0);
const date = (v: unknown) => (v == null ? null : new Date(v as string));

/** Who a document belongs to, for the download route's access check. */
export type Owned<T> = { doc: T; memberId: string | null; email: string | null };

/** The buyer as invoiced: business details come from the snapshot frozen at issue. */
function buyerOf(r: Record<string, unknown>, name: string, email: string): InvoiceBuyer {
  const billing = (r.billing_snapshot as BillingSnapshot | null) ?? null;
  return {
    name,
    email,
    phone: (r.phone_number as string) ?? null,
    companyName: billing?.companyName ?? null,
    gstin: billing?.gstin ?? null,
    address: billing?.address ?? null,
  };
}

async function bookingDoc(id: string): Promise<Owned<InvoiceDoc> | null> {
  const [r] = await sql`
    SELECT b.id, b.status, b.member_id, b.customer_name, b.customer_email,
      b.ticket_code, b.invoice_no, b.invoiced_at, b.billing_snapshot,
      u.phone_number,
      min(r.start_at) AS start_at, max(r.end_at) AS end_at,
      count(r.id)::int AS seats,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot))[1] AS quote,
      p.payment_method, p.cf_payment_id, p.paid_at
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    LEFT JOIN "user" u ON u.id = b.member_id
    LEFT JOIN LATERAL (
      -- A desk payment keeps the staff-entered reference in raw.
      SELECT payment_method, coalesce(cf_payment_id, raw->>'reference') AS cf_payment_id, paid_at FROM payment
      WHERE booking_id = b.id AND status = 'paid' ORDER BY paid_at LIMIT 1
    ) p ON true
    WHERE b.id = ${id} AND b.invoice_no IS NOT NULL
    GROUP BY b.id, u.phone_number, p.payment_method, p.cf_payment_id, p.paid_at`;
  if (!r) return null;
  const startAt = new Date(r.start_at as string);
  const endAt = new Date(r.end_at as string);
  return {
    memberId: (r.member_id as string) ?? null,
    email: r.customer_email as string,
    doc: bookingInvoice({
      invoiceNo: r.invoice_no as string,
      invoicedAt: new Date(r.invoiced_at as string),
      status: r.status as "active" | "cancelled",
      buyer: buyerOf(r, r.customer_name as string, r.customer_email as string),
      plan: (r.plan as string) ?? null,
      seats: n(r.seats),
      ticketCode: (r.ticket_code as string) ?? null,
      when: ticketWhen({ startAt, endAt }),
      quote: (r.quote as Record<string, unknown>) ?? {},
      payment: r.paid_at
        ? {
            method: (r.payment_method as string) ?? null,
            reference: (r.cf_payment_id as string) ?? null,
            paidAt: date(r.paid_at),
          }
        : null,
    }),
  };
}

/** A booking's tax invoice, by booking id. */
export async function getInvoiceDoc(id: string): Promise<Owned<InvoiceDoc> | null> {
  if (!UUID.test(id)) return null;
  return bookingDoc(id);
}

export type MyDocument = {
  id: string;
  number: string;
  issuedAt: Date;
  title: string;
  /** Service or billing period. */
  period: string;
  totalMinor: number;
  status: "paid" | "due" | "cancelled";
};

/** Every tax invoice a customer can download, newest first. */
export async function listMyDocuments(userId: string, email: string): Promise<MyDocument[]> {
  const rows = await sql`
    SELECT b.id, b.status, b.invoice_no, b.invoiced_at,
      min(r.start_at) AS start_at, max(r.end_at) AS end_at,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot ->> 'totalMinor'))[1]::bigint AS total_minor,
      EXISTS (SELECT 1 FROM payment p WHERE p.booking_id = b.id AND p.status = 'paid') AS paid
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE (b.member_id = ${userId} OR b.customer_email = ${email})
      AND b.invoice_no IS NOT NULL
    GROUP BY b.id
    ORDER BY b.invoiced_at DESC, b.invoice_no DESC`;

  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    number: r.invoice_no as string,
    issuedAt: new Date(r.invoiced_at as string),
    title: (r.plan as string) ?? "Workspace booking",
    period: ticketWhen({ startAt: new Date(r.start_at as string), endAt: new Date(r.end_at as string) }),
    totalMinor: n(r.total_minor),
    status: r.status === "cancelled" ? "cancelled" : r.paid ? "paid" : "due",
  }));
}
