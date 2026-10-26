// Shared fixtures for the ticket/check-in/scan suites.

import { afterAll, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../lib/db/schema";
import {
  confirmBooking,
  holdReservation,
  issueTicket,
} from "../../lib/domain/reservations";
import { makeClient, migrateDb, resetBookings, seedInventory, type TestDb } from "./db";

/** Migrated DB with fresh inventory and no bookings before every test. */
export function setupSeededDb() {
  const ctx = {} as { db: TestDb; client: ReturnType<typeof makeClient>["client"] };
  beforeAll(async () => {
    Object.assign(ctx, makeClient());
    await migrateDb(ctx.db);
  });
  afterAll(async () => {
    await ctx.client.end();
  });
  beforeEach(async () => {
    await resetBookings(ctx.db);
    await ctx.client`TRUNCATE TABLE "resource","rate_plan","zone","floor","location" RESTART IDENTITY CASCADE`;
    await seedInventory(ctx.db);
  });
  return ctx;
}

/** A confirmed public-flow booking on 2026-12-01: one person books the 4-seater
 * room (default 09:00–11:00 IST); a group books Half Day Passes from `start`. */
export async function bookConfirmed(
  db: TestDb,
  opts: { date?: string; start?: number; duration?: number; seats?: number } = {},
) {
  const date = opts.date ?? "2026-12-01";
  const start = opts.start ?? 9;
  const product =
    (opts.seats ?? 1) > 1
      ? { productKey: "day-half", date, start, people: opts.seats }
      : { productKey: "meeting-4", date, start, duration: opts.duration ?? 2 };
  const held = await holdReservation(db, {
    ...product,
    customerName: "Test Guest",
    customerEmail: "guest@example.com",
  });
  if (!held.ok) throw new Error(`hold failed: ${held.error}`);
  const confirmed = await confirmBooking(db, { bookingId: held.bookingId });
  if (!confirmed.ok) throw new Error(`confirm failed: ${confirmed.error}`);
  const [b] = await db.select().from(schema.booking).where(eq(schema.booking.id, held.bookingId));
  return { bookingId: held.bookingId, token: confirmed.ticketToken, code: b.ticketCode! };
}

/** A confirmed whole-day booking (like staff "extended"), inclusive dates. */
export async function insertMultiDay(db: TestDb, startDate: string, endDate: string) {
  const [res] = await db.select().from(schema.resource).where(eq(schema.resource.kind, "desk")).limit(1);
  const [plan] = await db.select().from(schema.ratePlan).where(eq(schema.ratePlan.appliesToKind, "desk")).limit(1);
  const startAt = new Date(`${startDate}T00:00:00+05:30`);
  const endAt = new Date(new Date(`${endDate}T00:00:00+05:30`).getTime() + 86_400_000);
  return db.transaction(async (tx) => {
    const [b] = await tx
      .insert(schema.booking)
      .values({ customerName: "Long Stay", customerEmail: "long@example.com" })
      .returning({ id: schema.booking.id });
    await tx.insert(schema.reservation).values({
      bookingId: b.id,
      resourceId: res.id,
      ratePlanId: plan.id,
      startAt,
      endAt,
      status: "confirmed",
      quoteSnapshot: { extended: true, totalMinor: 500000 },
    });
    const t = await issueTicket(tx, b.id);
    return { bookingId: b.id, token: t.token, code: t.code };
  });
}
