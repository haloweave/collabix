"use server";

import { revalidatePath } from "next/cache";
import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as authSchema from "@/lib/db/auth-schema";
import { requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { termHoldBody } from "@/lib/api/validation";
import { confirmBooking, holdTerm } from "@/lib/domain/reservations";
import { recordDeskPayment, type DeskMethod } from "@/lib/domain/desk-payment";
import { toIndianMobile } from "@/lib/sms";

export type PaidBy = DeskMethod;

const PASS_ERRORS: Record<string, string> = {
  seat_unavailable: "No desk or cabin of that plan is free for the whole term.",
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
  const mobile = input.phone?.trim() ? toIndianMobile(input.phone) : null;
  if (input.phone?.trim() && !mobile) return { ok: false, error: "Enter a valid 10-digit mobile number." };
  // Accounts store numbers in E.164, as the phone sign-in creates them.
  const phone = mobile ? `+91${mobile}` : null;

  const [member] = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(
      phone
        ? or(eq(authSchema.user.email, email), eq(authSchema.user.phoneNumber, phone))
        : eq(authSchema.user.email, email),
    )
    .limit(1);

  const held = await holdTerm(db, { ...parsed.data, customerEmail: email, holdMinutes: 5 });
  if (!held.ok) {
    return { ok: false, error: PASS_ERRORS[held.error] ?? `Couldn't record the pass: ${held.error}.` };
  }
  const confirmed = await confirmBooking(db, { bookingId: held.bookingId, memberId: member?.id });
  if (!confirmed.ok) return { ok: false, error: "That desk or cabin was just taken. Please try again." };
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
      coupon: held.quote.discount?.code,
      totalMinor: held.quote.totalMinor,
      paidBy: input.paidBy,
      reference: input.reference?.trim() || null,
      paymentRecorded: paid.ok,
    },
  });
  revalidatePath("/admin/memberships");
  if (member) revalidatePath(`/admin/members/${member.id}`);
  if (!paid.ok) {
    return {
      ok: false,
      error: "Membership recorded, but the payment wasn't. Mark it paid from the booking page.",
      bookingId: held.bookingId,
    };
  }
  return { ok: true, bookingId: held.bookingId };
}
