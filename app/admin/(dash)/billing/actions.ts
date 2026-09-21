"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireManager } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { getSettings } from "@/lib/settings";
import { getMemberSubscription } from "@/lib/admin/queries";
import { createPaymentOrder } from "@/lib/payments";

// Generate a monthly statement for a member's current subscription period:
//   membership fee + overage (hours booked beyond the included allowance).
// Overage hours are computed live (see getMemberSubscription); long-term holds
// are excluded from usage and covered by the fee.
export async function generateStatement(
  memberId: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  await requireManager();

  const sub = await getMemberSubscription(memberId);
  if (!sub) return { ok: false, error: "Member has no active subscription." };

  const overageHours = Math.max(0, sub.hoursUsed - sub.includedHours);
  const overageMinor = overageHours * sub.overageRateMinor;

  const lineItems: { label: string; amountMinor: number }[] = [
    { label: `${sub.planName} membership`, amountMinor: sub.priceMinor },
  ];
  if (overageMinor > 0) {
    lineItems.push({
      label: `Overage — ${overageHours}h beyond ${sub.includedHours}h`,
      amountMinor: overageMinor,
    });
  }

  const subtotalMinor = lineItems.reduce((s, l) => s + l.amountMinor, 0);
  const settings = await getSettings(db);
  const taxMinor = Math.round((subtotalMinor * settings.taxPercent) / 100);
  const totalMinor = subtotalMinor + taxMinor;

  const [row] = await db
    .insert(schema.invoice)
    .values({
      memberId,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      status: "draft",
      lineItems,
      subtotalMinor,
      taxMinor,
      totalMinor,
    })
    .returning({ id: schema.invoice.id });

  await logAudit({
    action: "invoice.generate",
    targetType: "invoice",
    targetId: row.id,
    detail: { memberId, totalMinor },
  });
  revalidatePath("/admin/billing");
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: true, invoiceId: row.id };
}

export async function markInvoicePaid(id: string, ref?: string) {
  await requireManager();
  await db
    .update(schema.invoice)
    .set({ status: "paid", paidAt: new Date(), paymentRef: ref?.trim() || "manual" })
    .where(eq(schema.invoice.id, id));
  await logAudit({ action: "invoice.mark_paid", targetType: "invoice", targetId: id });
  revalidatePath("/admin/billing");
}

export async function voidInvoice(id: string) {
  await requireManager();
  await db
    .update(schema.invoice)
    .set({ status: "void" })
    .where(eq(schema.invoice.id, id));
  await logAudit({ action: "invoice.void", targetType: "invoice", targetId: id });
  revalidatePath("/admin/billing");
}

// Create a gateway payment order for an invoice. In manual mode (no Razorpay
// keys) returns { manual: true } so the UI falls back to "mark paid".
export async function createInvoicePaymentLink(
  id: string,
): Promise<{ manual: true } | { manual: false; orderId: string }> {
  await requireManager();
  const [inv] = await db
    .select()
    .from(schema.invoice)
    .where(eq(schema.invoice.id, id));
  if (!inv) throw new Error("invoice_not_found");

  const order = await createPaymentOrder({
    amountMinor: inv.totalMinor,
    receipt: inv.id,
  });
  if (!order) return { manual: true };

  await db
    .update(schema.invoice)
    .set({ status: "sent", paymentRef: order.orderId })
    .where(eq(schema.invoice.id, id));
  await logAudit({
    action: "invoice.payment_link",
    targetType: "invoice",
    targetId: id,
    detail: { orderId: order.orderId },
  });
  revalidatePath("/admin/billing");
  return { manual: false, orderId: order.orderId };
}
