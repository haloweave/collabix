// Reservation engine: availability, hold, confirm, and lazy hold-expiry.
// Double-booking is prevented by the Postgres exclusion constraint
// (drizzle/0001_reservation_no_overlap.sql), not by application checks — the DB
// is the source of truth for exclusion. These functions layer server-authoritative
// validation, pricing, and the expiry sweep on top.

import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { priceBooking, productWindow, toUtcWindow, type Quote, type WindowInput } from "./booking";
import { bookableProduct, type BookableProduct } from "../tariff";
import { autoAssignDesks, type Slot } from "../floorplan";
import { getSettings } from "../settings";
import { newTicketCode, newTicketToken } from "./ticket-codes";

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
  customerName: string;
  customerEmail: string;
  idempotencyKey?: string;
  holdMinutes?: number;
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
  | { ok: true; window: WindowInput; resources: Slot[] }
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
  const taken = new Set(overlapping.map((r) => r.resourceId));
  return resources.map((r) => ({ resourceId: r.id, code: r.code, available: !taken.has(r.id) }));
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
  return { ok: true, window: w.window, resources: await productSlots(db, product, w.window) };
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
  // a pass gets one free desk per person (the guest's picks if all are free).
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
    if (picked.length === people && picked.every((id) => freeIds.has(id))) {
      resourceIds = picked;
    } else {
      const codes = autoAssignDesks(free.map((s) => s.code), people);
      if (codes.length < people) return { ok: false, error: "not_enough_desks" };
      const idByCode = new Map(free.map((s) => [s.code, s.resourceId]));
      resourceIds = codes.map((c) => idByCode.get(c)!);
    }
  }

  const quote = priceBooking(product, window, people, now);
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
    }
    // The ticket is issued with confirmation — once Cashfree lands, confirmation
    // happens only after payment, so "has a ticket" means "paid".
    const ticket = await issueTicket(tx, input.bookingId);
    return { ok: true as const, ticketToken: ticket.token, newlyConfirmed: held.length > 0 };
  });
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
