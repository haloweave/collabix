"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireManager, requireStaff } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/audit";
import { holdBody } from "@/lib/api/validation";
import {
  confirmBooking,
  getAvailability,
  holdReservation,
  type HoldInput,
} from "@/lib/domain/reservations";
import { holdSeries, releaseHolds, upcomingInSeries, type RepeatEvery } from "@/lib/domain/recurring";
import { MAX_OCCURRENCES, seriesDates } from "@/lib/recurrence";
import { bookableProduct } from "@/lib/tariff";
import { cancelBookingRecord } from "@/lib/domain/cancel";
import { recordManualRefund, refundOnline } from "@/lib/domain/refunds";
import { getCashfreeGateway } from "@/lib/payments/cashfree";
import { payFromWallet } from "@/lib/domain/wallet";
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
  seat_taken: "A desk you picked is already taken for that time.",
  seat_count: "Pick one desk for each person, or leave it on any free desk.",
  closed_date: "Collabix is closed on that date.",
  invalid_coupon: "That coupon code isn't active.",
  coupon_covers_total: "That coupon leaves nothing to pay.",
};

export type WalkInResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string };

export type WalkInDesk = { resourceId: string; code: string; available: boolean };

// The desks a walk-in pass could use, each free only if it's free on every
// date of the booking (all of a repeating series), so staff can block a
// particular desk. Rooms have no choice of seat, so they get an empty list.
export async function walkInDesks(input: {
  productKey: string;
  date: string;
  start?: number;
  repeat?: { every: RepeatEvery; count: number };
}): Promise<WalkInDesk[]> {
  await requireStaff();
  if (bookableProduct(input.productKey)?.kind !== "pass") return [];
  const count = input.repeat ? Math.min(Math.max(1, input.repeat.count), MAX_OCCURRENCES) : 1;
  const dates = input.repeat ? seriesDates(input.date, input.repeat.every, count) : [input.date];
  let desks: WalkInDesk[] | null = null;
  for (const date of dates) {
    const r = await getAvailability(db, { productKey: input.productKey, date, start: input.start });
    if (!r.ok) return [];
    const free = new Map(r.resources.map((s) => [s.resourceId, s.available]));
    desks = (desks ?? r.resources.map(({ resourceId, code }) => ({ resourceId, code, available: true }))).map(
      (d) => ({ ...d, available: d.available && (free.get(d.resourceId) ?? false) }),
    );
  }
  return desks ?? [];
}

// Staff-created (walk-in) booking: use the desks staff picked, or auto-pick the
// first N available seats for the window, hold them, and confirm immediately — same engine as the customer flow
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
  /** Passes: book exactly these desks (one per person); omit to auto-assign. */
  resourceIds?: string[];
  /** Repeat the same booking on later dates (each its own booking). */
  repeat?: { every: RepeatEvery; count: number };
}): Promise<WalkInResult> {
  await requireStaff();

  const parsed = holdBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the product, date, time and customer details." };
  const phone = toAccountPhone(input.phone ?? "");
  if (!phone) return { ok: false, error: "Enter the customer's 10-digit mobile number." };
  const email = parsed.data.customerEmail.toLowerCase();
  const memberId = await findMemberByContact(email, phone);
  const exactSeats = (parsed.data.resourceIds?.length ?? 0) > 0;

  if (input.repeat) {
    return createSeries(
      { ...parsed.data, customerEmail: email, holdMinutes: 5, exactSeats },
      input.repeat,
      memberId ?? undefined,
    );
  }

  const held = await holdReservation(db, {
    ...parsed.data,
    customerEmail: email,
    holdMinutes: 5,
    exactSeats,
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
      seats: exactSeats ? parsed.data.resourceIds : undefined,
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

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Hold every date of a walk-in series, then confirm them all. */
async function createSeries(
  hold: HoldInput,
  repeat: { every: RepeatEvery; count: number },
  memberId: string | undefined,
): Promise<WalkInResult> {
  const held = await holdSeries(db, { ...hold, ...repeat });
  if (!held.ok) {
    if (held.error === "bad_count") return { ok: false, error: "Repeat between 2 and 12 times." };
    const why = WALK_IN_ERRORS[held.error] ?? held.error;
    return { ok: false, error: held.date ? `${fmtDate(held.date)}: ${why} Nothing was booked.` : why };
  }

  const confirmed: string[] = [];
  for (const bookingId of held.bookingIds) {
    const c = await confirmBooking(db, { bookingId, memberId });
    if (!c.ok) {
      // Holds are minutes old, so this is near-impossible; undo the series cleanly.
      for (const id of confirmed) await cancelBookingRecord(db, { bookingId: id, by: "system" });
      await releaseHolds(db, held.bookingIds.filter((id) => !confirmed.includes(id)));
      return { ok: false, error: "Could not confirm every date. Nothing was booked." };
    }
    confirmed.push(bookingId);
  }

  await logAudit({
    action: "booking.create_series",
    targetType: "booking",
    targetId: held.bookingIds[0],
    detail: {
      seriesId: held.seriesId,
      productKey: hold.productKey,
      every: repeat.every,
      dates: held.dates,
      totalMinor: held.totalMinor,
    },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  return { ok: true, bookingId: held.bookingIds[0] };
}

/** Cancel every date of a series that hasn't started yet. */
export async function cancelSeriesRemaining(seriesId: string): Promise<{ ok: true; cancelled: number }> {
  const staff = await requireStaff();
  const ids = await upcomingInSeries(db, seriesId);
  let cancelled = 0;
  for (const bookingId of ids) {
    const res = await cancelBookingRecord(db, { bookingId, by: staff.email });
    if (!res.ok) continue;
    cancelled++;
    await sendCancellationEmail(bookingId, {
      byStaff: true,
      refundMinor: res.refund?.amountMinor,
      refundedToWallet: res.refund?.settled,
    });
  }
  await logAudit({ action: "booking.cancel_series", targetType: "series", targetId: seriesId, detail: { cancelled } });
  revalidatePath("/admin/bookings");
  for (const id of ids) revalidatePath(`/admin/bookings/${id}`);
  return { ok: true, cancelled };
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

const WALLET_PAY_ERRORS: Record<string, string> = {
  not_found: "This booking is cancelled or no longer exists.",
  already_paid: "This booking is already paid.",
  insufficient_funds: "The wallet doesn't have enough for this booking.",
  no_amount: "This booking has no amount to collect.",
  hold_expired: "This booking isn't confirmed.",
  not_payable: "This booking can't be paid from the wallet.",
};

/** Settle a confirmed booking from its member's wallet at the front desk. */
export async function chargeWallet(bookingId: string, memberId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireStaff();
  const res = await payFromWallet(db, { bookingId, userId: memberId, by: staff.email, allowConfirmed: true });
  if (!res.ok) return { ok: false, error: WALLET_PAY_ERRORS[res.error] ?? "Could not charge the wallet." };
  await logAudit({
    action: "booking.paid_from_wallet",
    targetType: "booking",
    targetId: bookingId,
    detail: { memberId, amountMinor: res.amountMinor },
  });
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}
