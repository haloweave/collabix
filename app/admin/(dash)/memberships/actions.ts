"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { termHoldBody } from "@/lib/api/validation";
import { confirmBooking, holdTerm } from "@/lib/domain/reservations";
import { recordDeskPayment, type DeskMethod } from "@/lib/domain/desk-payment";
import { findMemberByContact, toAccountPhone } from "@/lib/admin/member-lookup";

export type PaidBy = DeskMethod;

const PASS_ERRORS: Record<string, string> = {
  seat_unavailable: "Not enough desks or cabins of that plan are free for the whole term.",
  unknown_plan: "That plan isn't on sale.",
  invalid_coupon: "That coupon code isn't active.",
  coupon_covers_total: "That coupon leaves nothing to pay.",
};

export type RecordPassResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string; bookingId?: string };

// A monthly or annual pass sold at the front desk: the same plans, prices and
// desk/cabin assignment as /book/passes, confirmed straight away because the
// money was taken in person. Linked to the member's account when their email
// or mobile matches one.
export async function recordPass(input: {
  planKey: string;
  date: string;
  unit: "month" | "year";
  count: number;
  /** Desks or cabins to hold; one by default. */
  spaces?: number;
  customerName: string;
  customerEmail: string;
  phone?: string;
  paidBy: PaidBy;
  reference?: string;
  couponCode?: string;
}): Promise<RecordPassResult> {
  const staff = await requireStaff();

  const parsed = termHoldBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the plan, start date, term and customer details." };
  const email = parsed.data.customerEmail.toLowerCase();
  const phone = input.phone?.trim() ? toAccountPhone(input.phone) : null;
  if (input.phone?.trim() && !phone) return { ok: false, error: "Enter a valid 10-digit mobile number." };
  const memberId = await findMemberByContact(email, phone);

  const held = await holdTerm(db, { ...parsed.data, customerEmail: email, holdMinutes: 5 });
  if (!held.ok) {
    return { ok: false, error: PASS_ERRORS[held.error] ?? `Couldn't record the pass: ${held.error}.` };
  }
  const confirmed = await confirmBooking(db, { bookingId: held.bookingId, memberId: memberId ?? undefined });
  if (!confirmed.ok) return { ok: false, error: "A desk or cabin was just taken. Please try again." };
  // The money was taken in person: record it like a desk payment on any booking,
  // so the invoice and every "is it paid?" check show it as paid.
  const paid = await recordDeskPayment(db, {
    bookingId: held.bookingId,
    method: input.paidBy,
    reference: input.reference,
    recordedBy: staff.id,
  });

  await logAudit({
    action: "membership.record",
    targetType: "booking",
    targetId: held.bookingId,
    detail: {
      planKey: parsed.data.planKey,
      unit: parsed.data.unit,
      count: parsed.data.count,
      spaces: parsed.data.spaces,
      coupon: held.quote.discount?.code,
      totalMinor: held.quote.totalMinor,
      paidBy: input.paidBy,
      reference: input.reference?.trim() || null,
      paymentRecorded: paid.ok,
    },
  });
  revalidatePath("/admin/memberships");
  if (memberId) revalidatePath(`/admin/members/${memberId}`);
  if (!paid.ok) {
    return {
      ok: false,
      error: "Membership recorded, but the payment wasn't. Mark it paid from the booking page.",
      bookingId: held.bookingId,
    };
  }
  return { ok: true, bookingId: held.bookingId };
}
