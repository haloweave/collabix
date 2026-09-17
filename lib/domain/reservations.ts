// Reservation engine: availability, hold, confirm, and lazy hold-expiry.
// Double-booking is prevented by the Postgres exclusion constraint
// (drizzle/0001_reservation_no_overlap.sql), not by application checks — the DB
// is the source of truth for exclusion. These functions layer server-authoritative
// validation, pricing, and the expiry sweep on top.

import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { computeQuote, toUtcWindow, validateWindow, type Quote } from "./booking";

export type Db = PostgresJsDatabase<typeof schema>;

const HELD_OR_CONFIRMED = ["held", "confirmed"] as const;

export type HoldInput = {
  planKey: string;
  resourceIds: string[];
  date: string;
  start: number;
  duration: number;
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
  planKey: string;
  date: string;
  start: number;
  duration: number;
};

export async function getAvailability(db: Db, input: AvailabilityInput) {
  await sweepExpiredHolds(db);
  const plan = await getPlan(db, input.planKey);
  if (!plan) throw new Error(`unknown rate plan: ${input.planKey}`);

  const { startAt, endAt } = toUtcWindow(input);

  const resources = await db
    .select()
    .from(schema.resource)
    .where(
      and(
        eq(schema.resource.kind, plan.appliesToKind),
        eq(schema.resource.enabled, true),
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

  return resources.map((r) => ({
    resourceId: r.id,
    code: r.code,
    available: !taken.has(r.id),
  }));
}

export async function holdReservation(db: Db, input: HoldInput): Promise<HoldResult> {
  await sweepExpiredHolds(db);

  const window = validateWindow(input, new Date());
  if (!window.ok) return { ok: false, error: window.error };

  const plan = await getPlan(db, input.planKey);
  if (!plan) return { ok: false, error: "unknown_plan" };

  const resourceIds = [...new Set(input.resourceIds)];
  if (resourceIds.length === 0) return { ok: false, error: "no_seats" };

  const resources = await db
    .select()
    .from(schema.resource)
    .where(inArray(schema.resource.id, resourceIds));
  if (resources.length !== resourceIds.length) {
    return { ok: false, error: "unknown_resource" };
  }
  if (resources.some((r) => r.kind !== plan.appliesToKind)) {
    return { ok: false, error: "plan_kind_mismatch" };
  }

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

  const quote = computeQuote(plan.rateMinor, input.duration, resourceIds.length);
  const { startAt, endAt } = toUtcWindow(input);
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

export type ConfirmResult = { ok: true } | { ok: false; error: string };

// Confirm a whole booking: every held reservation under it becomes confirmed,
// atomically. If any held reservation has expired, expire the lapsed ones and
// refuse — a team booking confirms in full or not at all.
export async function confirmBooking(
  db: Db,
  input: { bookingId: string; memberId?: string },
): Promise<ConfirmResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.reservation)
      .where(eq(schema.reservation.bookingId, input.bookingId))
      .for("update");
    if (rows.length === 0) return { ok: false, error: "not_found" };

    const held = rows.filter((r) => r.status === "held");
    const now = Date.now();
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

    if (held.length > 0) {
      await tx
        .update(schema.reservation)
        .set({ status: "confirmed" })
        .where(inArray(schema.reservation.id, held.map((r) => r.id)));
    }
    if (input.memberId) {
      await tx
        .update(schema.booking)
        .set({ memberId: input.memberId })
        .where(eq(schema.booking.id, input.bookingId));
    }
    return { ok: true };
  });
}
