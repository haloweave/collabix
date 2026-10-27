// Tax invoice numbering. GST rule 46(b) wants a consecutive serial, unique for
// the financial year, of at most 16 characters: CBX/26-27/0001 is 14.

import { eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Tx } from "./reservations";

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** The Indian financial year (April–March, IST) a moment falls in, as "26-27". */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const start = ist.getUTCFullYear() - (ist.getUTCMonth() < 3 ? 1 : 0);
  const yy = (y: number) => String(y % 100).padStart(2, "0");
  return `${yy(start)}-${yy(start + 1)}`;
}

export function formatInvoiceNo(fy: string, seq: number): string {
  return `CBX/${fy}/${String(seq).padStart(4, "0")}`;
}

export type BillingSnapshot = { companyName: string | null; gstin: string | null; address: string | null };

/** The customer's business details as they stand now, or null if they have none. */
async function billingSnapshot(tx: Tx, memberId: string | null): Promise<BillingSnapshot | null> {
  if (!memberId) return null;
  const [bp] = await tx
    .select()
    .from(schema.billingProfile)
    .where(eq(schema.billingProfile.userId, memberId));
  if (!bp || !(bp.companyName || bp.gstin || bp.address)) return null;
  return { companyName: bp.companyName, gstin: bp.gstin, address: bp.address };
}

/**
 * Give a confirmed booking its invoice number, freezing the buyer's business
 * details alongside it. Idempotent: an existing number is returned unchanged.
 * The counter row is locked by the upsert until the caller's transaction ends,
 * so concurrent confirmations take turns and a rollback releases the serial
 * unused.
 */
export async function issueInvoiceNo(
  tx: Tx,
  bookingId: string,
  now = new Date(),
): Promise<string> {
  const [cur] = await tx
    .select({ no: schema.booking.invoiceNo, memberId: schema.booking.memberId })
    .from(schema.booking)
    .where(eq(schema.booking.id, bookingId));
  if (!cur) throw new Error(`issueInvoiceNo: booking ${bookingId} not found`);
  if (cur.no) return cur.no;

  const fy = financialYear(now);
  const [{ last }] = await tx
    .insert(schema.invoiceCounter)
    .values({ fy, last: 1 })
    .onConflictDoUpdate({
      target: schema.invoiceCounter.fy,
      set: { last: sql`${schema.invoiceCounter.last} + 1` },
    })
    .returning({ last: schema.invoiceCounter.last });
  const no = formatInvoiceNo(fy, last);
  await tx
    .update(schema.booking)
    .set({ invoiceNo: no, invoicedAt: now, billingSnapshot: await billingSnapshot(tx, cur.memberId) })
    .where(eq(schema.booking.id, bookingId));
  return no;
}
