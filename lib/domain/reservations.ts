// Reservation engine: availability, hold, confirm, and lazy hold-expiry.
// Double-booking is prevented by the Postgres exclusion constraint
// (drizzle/0001_reservation_no_overlap.sql), not by application checks — the DB
// is the source of truth for exclusion. These functions layer server-authoritative
// validation, pricing, and the expiry sweep on top.

import { and, eq, gt, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import * as authSchema from "../db/auth-schema";
import { priceBooking, productWindow, toUtcWindow, type Quote, type WindowInput } from "./booking";
import { applyCoupon, normalizeCouponCode, type Coupon } from "./coupon";
import { TERM_PLANS, bookableProduct, findTermPlan, type BookableProduct, type TermPlan } from "../tariff";
import { priceTerms, termWindow, type TermInput, type TermItem, type TermWindow } from "./term";
import { autoAssignDesks, type Slot } from "../floorplan";
import { getSettings } from "../settings";
import { newTicketCode, newTicketToken } from "./ticket-codes";
import { issueInvoiceNo } from "./invoice-number";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const HELD_OR_CONFIRMED = ["held", "confirmed"] as const;

export type HoldInput = {
  /** A tariff product key (lib/tariff.ts BOOKABLE). */
  productKey: string;
  date: string;
  /** Half Day Pass and rooms: start hour (IST). */
  start?: number;
  /** Rooms: length in hours. */
  duration?: number;
  /** Passes: number of people, one desk each. Rooms ignore it. */
  people?: number;
  /** Passes only: specific free desks to use; otherwise desks are auto-assigned. */
  resourceIds?: string[];
  /** Staff picks: book exactly `resourceIds` (one per person) or refuse —
   * never swap in a different desk. Guests leave it off and get a fallback. */
  exactSeats?: boolean;
  customerName: string;
  customerEmail: string;
  idempotencyKey?: string;
  holdMinutes?: number;
  /** A discount code from the admin dashboard; refused if not active. */
  couponCode?: string;
};

export type HoldResult =
  | {
      ok: true;
      bookingId: string;
      reservationIds: string[];
      holdExpiresAt: Date;
      quote: Quote;
    }
  | { ok: false; error: string };

/** Postgres exclusion-constraint violation (SQLSTATE 23P01). */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function isOverlapViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string; cause?: { code?: string } };
  return (
    err?.code === "23P01" ||
    err?.cause?.code === "23P01" ||
    /reservation_no_overlap|exclusion/i.test(String(err?.message ?? ""))
  );
}

/** An active, unexpired coupon by code, or null. */
export async function findActiveCoupon(db: Db, code: string): Promise<Coupon | null> {
  const c = normalizeCouponCode(code);
  if (!c) return null;
  const [row] = await db
    .select()
    .from(schema.coupon)
    .where(
      and(
        sql`upper(${schema.coupon.code}) = ${c}`,
        eq(schema.coupon.active, true),
        or(isNull(schema.coupon.expiresAt), gt(schema.coupon.expiresAt, sql`now()`)),
      ),
    )
    .limit(1);
  return row ? { code: row.code, kind: row.kind as Coupon["kind"], value: row.value } : null;
}

/** The quote with the booking's coupon, if any. A coupon that would leave
 * nothing to pay is refused: every booking still has an amount to collect. */
async function withCoupon(
  db: Db,
  quote: Quote,
  code: string | undefined,
): Promise<{ ok: true; quote: Quote } | { ok: false; error: string }> {
  if (!code?.trim()) return { ok: true, quote };
  const coupon = await findActiveCoupon(db, code);
  if (!coupon) return { ok: false, error: "invalid_coupon" };
  const discounted = applyCoupon(quote, coupon);
  if (discounted.totalMinor < 100) return { ok: false, error: "coupon_covers_total" };
  return { ok: true, quote: discounted };
}

async function getPlan(db: Db, key: string) {
  const [plan] = await db
    .select()
    .from(schema.ratePlan)
    .where(eq(schema.ratePlan.key, key))
    .limit(1);
  return plan;
}

/** Flip held reservations past their expiry to 'expired', freeing the slot. */
export async function sweepExpiredHolds(db: Db): Promise<number> {
  const rows = await db
    .update(schema.reservation)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.reservation.status, "held"),
        lt(schema.reservation.holdExpiresAt, sql`now()`),
      ),
    )
    .returning({ id: schema.reservation.id });
  return rows.length;
}

export type AvailabilityInput = {
  productKey: string;
  date: string;
  start?: number;
  duration?: number;
};

export type AvailabilityResult =
  | {
      ok: true;
      window: WindowInput;
      resources: Slot[];
      /** Every other enabled space (cabins, rooms, and desks for a room
       * booking) with its state for the same window, for the floor map. */
      others: Slot[];
    }
  | { ok: false; error: string };

/** The resources a product can use in a window, each marked free or taken.
 * Passes draw on the enabled desks; a room product on its own room only. */
async function productSlots(db: Db, product: BookableProduct, window: WindowInput): Promise<Slot[]> {
  const { startAt, endAt } = toUtcWindow(window);
  const resources = await db
    .select()
    .from(schema.resource)
    .where(
      and(
        eq(schema.resource.enabled, true),
        product.kind === "pass"
          ? eq(schema.resource.kind, "desk")
          : eq(schema.resource.code, product.roomCode!),
      ),
    )
    .orderBy(schema.resource.code);

  const taken = await takenResourceIds(db, startAt, endAt);
  return resources.map((r) => ({ resourceId: r.id, code: r.code, available: !taken.has(r.id) }));
}

/** Every enabled space not in `exclude`, each marked free or taken for the window. */
async function otherSlots(db: Db, window: WindowInput, exclude: Slot[]): Promise<Slot[]> {
  const { startAt, endAt } = toUtcWindow(window);
  const skip = new Set(exclude.map((s) => s.resourceId));
  const all = await db
    .select()
    .from(schema.resource)
    .where(eq(schema.resource.enabled, true))
    .orderBy(schema.resource.code);
  const taken = await takenResourceIds(db, startAt, endAt);
  return all
    .filter((r) => !skip.has(r.id))
    .map((r) => ({ resourceId: r.id, code: r.code, available: !taken.has(r.id) }));
}

/** Resources with a held or confirmed reservation overlapping [startAt, endAt). */
async function takenResourceIds(db: Db, startAt: Date, endAt: Date): Promise<Set<string>> {
  const overlapping = await db
    .select({ resourceId: schema.reservation.resourceId })
    .from(schema.reservation)
    .where(
      and(
        inArray(schema.reservation.status, [...HELD_OR_CONFIRMED]),
        lt(schema.reservation.startAt, endAt),
        gt(schema.reservation.endAt, startAt),
      ),
    );
  return new Set(overlapping.map((r) => r.resourceId));
}

export async function getAvailability(
  db: Db,
  input: AvailabilityInput,
  now = new Date(),
): Promise<AvailabilityResult> {
  await sweepExpiredHolds(db);
  const product = bookableProduct(input.productKey);
  if (!product) return { ok: false, error: "unknown_product" };
  const w = productWindow(product, input, now);
  if (!w.ok) return w;
  const resources = await productSlots(db, product, w.window);
  const others = await otherSlots(db, w.window, resources);
  return { ok: true, window: w.window, resources, others };
}

export async function holdReservation(
  db: Db,
  input: HoldInput,
  now = new Date(),
): Promise<HoldResult> {
  await sweepExpiredHolds(db);

  const product = bookableProduct(input.productKey);
  if (!product) return { ok: false, error: "unknown_product" };
  const w = productWindow(product, input, now);
  if (!w.ok) return { ok: false, error: w.error };
  const window = w.window;
  const settings = await getSettings(db);
  if (settings.closedDates.includes(window.date)) {
    return { ok: false, error: "closed_date" };
  }

  const plan = await getPlan(db, product.key);
  if (!plan || !plan.active) return { ok: false, error: "unknown_plan" };

  // Idempotency: an existing booking for this key wins without re-inserting.
  // The key is carried by the booking's first reservation.
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(schema.reservation)
      .where(eq(schema.reservation.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      const rows = await db
        .select({ id: schema.reservation.id })
        .from(schema.reservation)
        .where(eq(schema.reservation.bookingId, existing.bookingId));
      return {
        ok: true,
        bookingId: existing.bookingId,
        reservationIds: rows.map((r) => r.id),
        holdExpiresAt: existing.holdExpiresAt ?? new Date(),
        quote: existing.quoteSnapshot as Quote,
      };
    }
  }

  // Pick the resources server-side: a room product only ever gets its room;
  // a pass gets one free desk per person (the guest's free picks, then auto).
  const slots = await productSlots(db, product, window);
  const free = slots.filter((s) => s.available);
  let resourceIds: string[];
  const people = product.kind === "pass" ? Math.max(1, input.people ?? 1) : 1;
  if (product.kind === "room") {
    if (free.length === 0) return { ok: false, error: "seat_unavailable" };
    resourceIds = [free[0].resourceId];
  } else {
    const picked = [...new Set(input.resourceIds ?? [])];
    const freeIds = new Set(free.map((s) => s.resourceId));
    if (input.exactSeats) {
      if (picked.length !== people) return { ok: false, error: "seat_count" };
      if (!picked.every((id) => freeIds.has(id))) return { ok: false, error: "seat_taken" };
      resourceIds = picked;
    } else {
      // Keep the guest's picks that are still free; auto-assign the rest.
      const keep = picked.filter((id) => freeIds.has(id)).slice(0, people);
      const rest = free.filter((s) => !keep.includes(s.resourceId));
      const codes = autoAssignDesks(rest.map((s) => s.code), people - keep.length);
      if (keep.length + codes.length < people) return { ok: false, error: "not_enough_desks" };
      const idByCode = new Map(rest.map((s) => [s.code, s.resourceId]));
      resourceIds = [...keep, ...codes.map((c) => idByCode.get(c)!)];
    }
  }

  const priced = await withCoupon(db, priceBooking(product, window, people, now), input.couponCode);
  if (!priced.ok) return priced;
  const quote = priced.quote;
  const { startAt, endAt } = toUtcWindow(window);
  const holdExpiresAt = new Date(Date.now() + (input.holdMinutes ?? 10) * 60_000);

  try {
    // One booking, N reservations, all-or-nothing: if any seat conflicts, the
    // exclusion constraint aborts the whole transaction (no partial team hold).
    const result = await db.transaction(async (tx) => {
      const [b] = await tx
        .insert(schema.booking)
        .values({
          customerName: input.customerName,
          customerEmail: input.customerEmail,
        })
        .returning({ id: schema.booking.id });
      const rows = await tx
        .insert(schema.reservation)
        .values(
          resourceIds.map((resourceId, i) => ({
            bookingId: b.id,
            resourceId,
            ratePlanId: plan.id,
            startAt,
            endAt,
            status: "held" as const,
            holdExpiresAt,
            quoteSnapshot: quote,
            idempotencyKey: i === 0 ? input.idempotencyKey ?? null : null,
          })),
        )
        .returning({ id: schema.reservation.id });
      return { bookingId: b.id, reservationIds: rows.map((r) => r.id) };
    });
    return { ok: true, ...result, holdExpiresAt, quote };
  } catch (e) {
    if (isOverlapViolation(e)) return { ok: false, error: "seat_unavailable" };
    throw e;
  }
}

/* ---------- Monthly & annual passes ---------- */

export type TermAvailabilityResult =
  | { ok: true; window: TermWindow; free: number; resources: Slot[] }
  | { ok: false; error: string };

/** The desks (any shared desk) or cabins (C-xx) a term can take, each marked
 * free only if nothing overlaps any part of the term. */
async function termSlots(db: Db, space: TermPlan["space"], window: TermWindow): Promise<Slot[]> {
  const resources = await db
    .select()
    .from(schema.resource)
    .where(
      and(
        eq(schema.resource.enabled, true),
        space === "desk"
          ? eq(schema.resource.kind, "desk")
          : and(eq(schema.resource.kind, "room"), like(schema.resource.code, "C-%")),
      ),
    )
    .orderBy(schema.resource.code);
  const taken = await takenResourceIds(db, window.startAt, window.endAt);
  return resources.map((r) => ({ resourceId: r.id, code: r.code, available: !taken.has(r.id) }));
}

export async function getTermAvailability(
  db: Db,
  input: TermInput & { planKey: string },
  now = new Date(),
): Promise<TermAvailabilityResult> {
  await sweepExpiredHolds(db);
  const plan = findTermPlan(input.planKey);
  if (!plan) return { ok: false, error: "unknown_plan" };
  const w = termWindow(input, now);
  if (!w.ok) return w;
  const slots = await termSlots(db, plan.space, w.window);
  return { ok: true, window: w.window, free: slots.filter((s) => s.available).length, resources: slots };
}

export type TermHoldInput = TermInput & {
  /** One plan, with `spaces` of it… */
  planKey?: string;
  /** Desks (desk plans) or cabins (cabin plans) to hold; one by default. */
  spaces?: number;
  /** …or a mix of plans in one booking, each with its own count. */
  items?: { planKey: string; spaces?: number }[];
  /** The guest's own choice of fixed desks and cabins; used only if all are free. */
  resourceIds?: string[];
  customerName: string;
  customerEmail: string;
  holdMinutes?: number;
  couponCode?: string;
};

/** The plans asked for, one entry per plan in tariff order, or null if any is
 * unknown or no longer sold. */
function termItems(input: TermHoldInput): TermItem[] | null {
  const asked = input.items?.length
    ? input.items
    : input.planKey
      ? [{ planKey: input.planKey, spaces: input.spaces }]
      : [];
  const spacesByKey = new Map<string, number>();
  for (const a of asked) {
    if (!findTermPlan(a.planKey)?.onSale) return null;
    spacesByKey.set(a.planKey, (spacesByKey.get(a.planKey) ?? 0) + Math.max(1, a.spaces ?? 1));
  }
  const items = TERM_PLANS.filter((p) => spacesByKey.has(p.key)).map((plan) => ({
    plan,
    spaces: spacesByKey.get(plan.key)!,
  }));
  return items.length ? items : null;
}

/** A hot desk is any desk; every other plan holds a space the guest may choose. */
const isFlexi = (plan: TermPlan) => plan.key === "hot-desk";

/** Hold desks and cabins for a whole term, priced from the tariff: one plan or
 * a mix of them in a single booking. Paid and confirmed through the same flow
 * as any booking (lib/domain/payments.ts). */
export async function holdTerm(db: Db, input: TermHoldInput, now = new Date()): Promise<HoldResult> {
  await sweepExpiredHolds(db);
  const items = termItems(input);
  if (!items) return { ok: false, error: "unknown_plan" };
  const w = termWindow(input, now);
  if (!w.ok) return { ok: false, error: w.error };
  const ratePlanIds = new Map<string, string>();
  for (const { plan } of items) {
    const ratePlan = await getPlan(db, plan.key);
    if (!ratePlan || !ratePlan.active) return { ok: false, error: "unknown_plan" };
    ratePlanIds.set(plan.key, ratePlan.id);
  }

  const count = (pred: (p: TermPlan) => boolean) =>
    items.reduce((sum, i) => sum + (pred(i.plan) ? i.spaces : 0), 0);
  const deskCount = count((p) => p.space === "desk");
  const fixedDeskCount = count((p) => p.space === "desk" && !isFlexi(p));
  const cabinCount = count((p) => p.space === "cabin");

  const freeDesks = deskCount ? (await termSlots(db, "desk", w.window)).filter((s) => s.available) : [];
  const freeCabins = cabinCount ? (await termSlots(db, "cabin", w.window)).filter((s) => s.available) : [];
  if (freeDesks.length < deskCount || freeCabins.length < cabinCount) {
    return { ok: false, error: "seat_unavailable" };
  }

  // The guest's picks that are still free are kept, desks first to the
  // fixed-desk plans; whatever wasn't picked is clustered for the team, and
  // cabins without a pick are taken in order.
  const freeIds = new Set([...freeDesks, ...freeCabins].map((s) => s.resourceId));
  const picked = new Set((input.resourceIds ?? []).filter((id) => freeIds.has(id)));
  const pickedDesks = freeDesks.filter((s) => picked.has(s.resourceId)).slice(0, deskCount);
  const pickedCabins = freeCabins.filter((s) => picked.has(s.resourceId)).slice(0, cabinCount);
  const idByCode = new Map(freeDesks.map((s) => [s.code, s.resourceId]));
  const cluster = (from: Slot[], n: number) =>
    autoAssignDesks(from.map((s) => s.code), n).map((c) => idByCode.get(c)!);

  const deskIds = [
    ...pickedDesks.map((s) => s.resourceId),
    ...cluster(freeDesks.filter((s) => !picked.has(s.resourceId)), deskCount - pickedDesks.length),
  ];
  const fixedDesks = deskIds.slice(0, fixedDeskCount);
  const flexiDesks = deskIds.slice(fixedDeskCount);
  const cabins = [...pickedCabins, ...freeCabins.filter((s) => !picked.has(s.resourceId))]
    .slice(0, cabinCount)
    .map((s) => s.resourceId);
  if (fixedDesks.length + flexiDesks.length < deskCount) return { ok: false, error: "seat_unavailable" };

  // One reservation per space, each under its own plan.
  const spaces = items.flatMap(({ plan, spaces: n }) => {
    const pool = plan.space === "cabin" ? cabins : isFlexi(plan) ? flexiDesks : fixedDesks;
    return pool.splice(0, n).map((resourceId) => ({ resourceId, ratePlanId: ratePlanIds.get(plan.key)! }));
  });

  const priced = await withCoupon(db, priceTerms(items, input, now), input.couponCode);
  if (!priced.ok) return priced;
  const quote = priced.quote;
  const holdExpiresAt = new Date(Date.now() + (input.holdMinutes ?? 10) * 60_000);
  try {
    const result = await db.transaction(async (tx) => {
      const [b] = await tx
        .insert(schema.booking)
        .values({ customerName: input.customerName, customerEmail: input.customerEmail })
        .returning({ id: schema.booking.id });
      // All-or-nothing: one conflicting space aborts the whole team hold.
      const rows = await tx
        .insert(schema.reservation)
        .values(
          spaces.map(({ resourceId, ratePlanId }) => ({
            bookingId: b.id,
            resourceId,
            ratePlanId,
            startAt: w.window.startAt,
            endAt: w.window.endAt,
            status: "held" as const,
            holdExpiresAt,
            quoteSnapshot: quote,
          })),
        )
        .returning({ id: schema.reservation.id });
      return { bookingId: b.id, reservationIds: rows.map((r) => r.id) };
    });
    return { ok: true, ...result, holdExpiresAt, quote };
  } catch (e) {
    if (isOverlapViolation(e)) return { ok: false, error: "seat_unavailable" };
    throw e;
  }
}

export type ConfirmResult =
  // newlyConfirmed: this call turned held seats into confirmed ones (false on
  // a repeat call for an already-confirmed booking).
  | { ok: true; ticketToken: string; newlyConfirmed: boolean }
  | { ok: false; error: string };

// Confirm a whole booking: every held reservation under it becomes confirmed,
// atomically. If any held reservation has expired, expire the lapsed ones and
// refuse — a team booking confirms in full or not at all.
export async function confirmBooking(
  db: Db | Tx,
  input: {
    bookingId: string;
    memberId?: string;
    // A paid booking confirms even if its hold lapsed (and was swept to
    // 'expired'): the guest did pay. The exclusion constraint still refuses if
    // someone else holds the seat now → { error: "seat_unavailable" }.
    allowLapsedHold?: boolean;
  },
): Promise<ConfirmResult> {
  try {
    return await confirmInTx(db, input);
  } catch (e) {
    if (input.allowLapsedHold && isOverlapViolation(e)) {
      return { ok: false, error: "seat_unavailable" };
    }
    throw e;
  }
}

async function confirmInTx(
  db: Db | Tx,
  input: { bookingId: string; memberId?: string; allowLapsedHold?: boolean },
): Promise<ConfirmResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.reservation)
      .where(eq(schema.reservation.bookingId, input.bookingId))
      .for("update");
    if (rows.length === 0) return { ok: false, error: "not_found" };

    const now = Date.now();
    // Seats this call will confirm: live holds, plus lapsed/expired ones when
    // the caller vouches for payment.
    const held = input.allowLapsedHold
      ? rows.filter((r) => r.status === "held" || r.status === "expired")
      : rows.filter((r) => r.status === "held");
    if (!input.allowLapsedHold) {
      const expired = held.filter(
        (r) => r.holdExpiresAt && r.holdExpiresAt.getTime() < now,
      );
      if (expired.length > 0) {
        await tx
          .update(schema.reservation)
          .set({ status: "expired" })
          .where(inArray(schema.reservation.id, expired.map((r) => r.id)));
        return { ok: false, error: "hold_expired" };
      }
    }

    if (held.length > 0) {
      await tx
        .update(schema.reservation)
        .set({ status: "confirmed" })
        .where(inArray(schema.reservation.id, held.map((r) => r.id)));
    } else if (!rows.some((r) => r.status === "confirmed")) {
      // Nothing to confirm and nothing confirmed (all cancelled/expired): no
      // ticket may be issued for a booking that holds no seat.
      return { ok: false, error: "not_confirmable" };
    }
    // Only the confirmation itself may link a member: a repeat call with a
    // known booking id must not reassign someone else's booking.
    if (input.memberId && held.length > 0) {
      await tx
        .update(schema.booking)
        .set({ memberId: input.memberId })
        .where(eq(schema.booking.id, input.bookingId));
      await fillPlaceholderAccount(tx, input.memberId, input.bookingId);
    }
    // The ticket is issued with confirmation — once Cashfree lands, confirmation
    // happens only after payment, so "has a ticket" means "paid".
    const ticket = await issueTicket(tx, input.bookingId);
    // The tax invoice is raised at the same moment, numbered in confirmation order.
    await issueInvoiceNo(tx, input.bookingId);
    return { ok: true as const, ticketToken: ticket.token, newlyConfirmed: held.length > 0 };
  });
}

/** Domain of the stand-in email a phone sign-up gets (lib/auth.ts getTempEmail). */
const PLACEHOLDER_EMAIL_DOMAIN = "@phone.collabix.local";

/**
 * A phone OTP creates the account with the number as its name and a
 * placeholder email (lib/auth.ts). On the first booking, take the name and
 * email the customer typed at checkout so the next checkout is pre-filled.
 * Details the account already has are never overwritten, and an email another
 * account owns is left alone.
 */
async function fillPlaceholderAccount(tx: Tx, memberId: string, bookingId: string) {
  const [u] = await tx
    .select({ name: authSchema.user.name, email: authSchema.user.email, phone: authSchema.user.phoneNumber })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, memberId));
  if (!u) return;
  const placeholderName = u.name === u.phone;
  const placeholderEmail = u.email.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
  if (!placeholderName && !placeholderEmail) return;

  const [b] = await tx
    .select({ name: schema.booking.customerName, email: schema.booking.customerEmail })
    .from(schema.booking)
    .where(eq(schema.booking.id, bookingId));
  if (!b) return;
  const set: { name?: string; email?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (placeholderName && b.name.trim()) set.name = b.name.trim();
  const email = b.email.trim().toLowerCase();
  if (placeholderEmail && email) {
    const [taken] = await tx
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(sql`lower(${authSchema.user.email})`, email));
    if (!taken) set.email = email;
  }
  if (!set.name && !set.email) return;
  // In a savepoint: a lost race on the unique email must never undo a paid
  // booking's confirmation, only skip this nicety.
  try {
    await tx.transaction(async (sp) => {
      await sp.update(authSchema.user).set(set).where(eq(authSchema.user.id, memberId));
    });
  } catch (e) {
    console.error("[checkout] could not fill account details", e);
  }
}

/**
 * Give a confirmed booking its e-ticket (QR token + backup code). Idempotent:
 * an existing ticket is returned unchanged. A backup-code collision is retried
 * inside a savepoint so the caller's transaction survives.
 */
export async function issueTicket(
  tx: Tx,
  bookingId: string,
): Promise<{ token: string; code: string }> {
  const [cur] = await tx
    .select({ token: schema.booking.ticketToken, code: schema.booking.ticketCode })
    .from(schema.booking)
    .where(eq(schema.booking.id, bookingId));
  if (!cur) throw new Error(`issueTicket: booking ${bookingId} not found`);
  if (cur.token && cur.code) return { token: cur.token, code: cur.code };

  for (let attempt = 1; ; attempt++) {
    const next = { token: cur.token ?? newTicketToken(), code: cur.code ?? newTicketCode() };
    try {
      await tx.transaction(async (sp) => {
        await sp
          .update(schema.booking)
          .set({ ticketToken: next.token, ticketCode: next.code })
          .where(eq(schema.booking.id, bookingId));
      });
      return next;
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 5) throw e;
    }
  }
}
