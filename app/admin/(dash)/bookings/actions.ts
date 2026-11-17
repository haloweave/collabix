"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireManager, requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { holdBody } from "@/lib/api/validation";
import {
  confirmBooking,
  holdReservation,
} from "@/lib/domain/reservations";
import { cancelBookingRecord } from "@/lib/domain/cancel";
import { recordManualRefund, refundOnline } from "@/lib/domain/refunds";
import { getCashfreeGateway } from "@/lib/payments/cashfree";
import { sendCancellationEmail, sendRefundEmail } from "@/lib/booking-emails";
import { recordDeskPayment, removeDeskPayment } from "@/lib/domain/desk-payment";
import { findMemberByContact, toAccountPhone } from "@/lib/admin/member-lookup";

// Cancel a whole booking: release its seats, flag any payment for refund and
// tell the customer. The refund itself is a separate step (refundBooking).
export async function cancelBooking(bookingId: string) {
  const staff = await requireStaff();

  const res = await cancelBookingRecord(db, { bookingId, by: staff.email });
  if (!res.ok) return;

  await logAudit({
    action: "booking.cancel",
    targetType: "booking",
    targetId: bookingId,
    detail: res.refund ? { refundDueMinor: res.refund.amountMinor } : undefined,
  });
  await sendCancellationEmail(bookingId, { byStaff: true, refundMinor: res.refund?.amountMinor, refundedToWallet: res.refund?.settled });

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
}

const REFUND_ERRORS: Record<string, string> = {
  not_found: "That payment no longer exists.",
  nothing_owed: "Nothing is owed on this payment.",
  not_online: "This was paid at the desk. Hand the money back and record it instead.",
  gateway_error: "Cashfree didn't accept the refund. Try again in a minute.",
  gateway_failed: "Cashfree declined the refund. Check the Cashfree dashboard.",
  no_gateway: "Online payments aren't configured on this server.",
};

export type RefundActionResult = { ok: true; status: "refunded" | "pending" } | { ok: false; error: string };

/** Refund an online payment through Cashfree (managers and owners only). */
export async function refundOnlinePayment(bookingId: string, paymentId: string): Promise<RefundActionResult> {
  const staff = await requireManager();
  const gw = getCashfreeGateway();
  if (!gw) return { ok: false, error: REFUND_ERRORS.no_gateway };
  const res = await refundOnline(db, gw, { paymentId, by: staff.email });
  if (!res.ok) return { ok: false, error: REFUND_ERRORS[res.error] ?? "Could not refund." };
  await logAudit({
    action: "payment.refund_online",
    targetType: "booking",
    targetId: bookingId,
    detail: { paymentId, amountMinor: res.amountMinor, status: res.status },
  });
  await sendRefundEmail(bookingId, { amountMinor: res.amountMinor, online: true, settled: res.status === "refunded" });
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true, status: res.status };
}

/** Record money handed back outside Cashfree (managers and owners only). */
export async function recordRefund(
  bookingId: string,
  paymentId: string,
  reference: string,
): Promise<RefundActionResult> {
  await requireManager();
  const res = await recordManualRefund(db, { paymentId, reference });
  if (!res.ok) return { ok: false, error: REFUND_ERRORS[res.error] ?? "Could not record the refund." };
  await logAudit({
    action: "payment.refund_manual",
    targetType: "booking",
    targetId: bookingId,
    detail: { paymentId, amountMinor: res.amountMinor, reference: reference.trim() || null },
  });
  await sendRefundEmail(bookingId, { amountMinor: res.amountMinor, online: false, settled: true });
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true, status: "refunded" };
}

const WALK_IN_ERRORS: Record<string, string> = {
  not_enough_desks: "Not enough free desks for that day.",
  seat_unavailable: "That room is already booked for that time.",
  closed_date: "Collabix is closed on that date.",
  invalid_coupon: "That coupon code isn't active.",
  coupon_covers_total: "That coupon leaves nothing to pay.",
};

export type WalkInResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string };

// Staff-created (walk-in) booking: auto-pick the first N available seats for the
// window, hold them, and confirm immediately — same engine as the customer flow
// but without the OTP step. All-or-nothing on availability. The mobile is
// required (customers sign in by mobile only) and links the booking to their
// account when one matches.
export async function createWalkIn(input: {
  productKey: string;
  date: string;
  start?: number;
  duration?: number;
  people?: number;
  customerName: string;
  customerEmail: string;
  phone: string;
  couponCode?: string;
}): Promise<WalkInResult> {
  await requireStaff();

  const parsed = holdBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the product, date, time and customer details." };
  const phone = toAccountPhone(input.phone ?? "");
  if (!phone) return { ok: false, error: "Enter the customer's 10-digit mobile number." };
  const email = parsed.data.customerEmail.toLowerCase();
  const memberId = await findMemberByContact(email, phone);

  const held = await holdReservation(db, {
    ...parsed.data,
    customerEmail: email,
    holdMinutes: 5,
  });
  if (!held.ok) return { ok: false, error: WALK_IN_ERRORS[held.error] ?? held.error };

  const confirmed = await confirmBooking(db, { bookingId: held.bookingId, memberId: memberId ?? undefined });
  if (!confirmed.ok) return { ok: false, error: confirmed.error };

  await logAudit({
    action: "booking.create_walkin",
    targetType: "booking",
    targetId: held.bookingId,
    detail: {
      productKey: parsed.data.productKey,
      people: parsed.data.people,
      date: parsed.data.date,
      start: parsed.data.start,
      duration: parsed.data.duration,
      coupon: held.quote.discount?.code,
      totalMinor: held.quote.totalMinor,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return { ok: true, bookingId: held.bookingId };
}

const DESK_PAYMENT_ERRORS: Record<string, string> = {
  not_found: "This booking is cancelled or no longer exists.",
  not_confirmed: "Only a confirmed booking can be marked paid.",
  already_paid: "This booking is already paid.",
  no_amount: "This booking has no amount to collect.",
  bad_method: "Pick how the customer paid.",
};

// Front desk took the money (cash, UPI to the counter QR, card machine or a
// bank transfer): record it so the booking and its invoice read "Paid".
export async function markPaidAtDesk(input: {
  bookingId: string;
  method: string;
  reference?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const res = await recordDeskPayment(db, { ...input, recordedBy: staff.id });
  if (!res.ok) return { ok: false, error: DESK_PAYMENT_ERRORS[res.error] ?? "Could not record the payment." };

  await logAudit({
    action: "booking.paid_at_desk",
    targetType: "booking",
    targetId: input.bookingId,
    detail: { method: input.method, reference: input.reference?.trim() || null, amountMinor: res.amountMinor },
  });
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${input.bookingId}`);
  return { ok: true };
}

/** Take back a desk payment recorded by mistake. */
export async function undoDeskPayment(bookingId: string): Promise<{ ok: boolean }> {
  await requireStaff();
  const removed = await removeDeskPayment(db, bookingId);
  if (removed) {
    await logAudit({ action: "booking.desk_payment_removed", targetType: "booking", targetId: bookingId });
    revalidatePath(`/admin/bookings/${bookingId}`);
  }
  return { ok: removed };
}
