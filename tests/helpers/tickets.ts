// Shared fixtures for the ticket/check-in/scan suites.

import { afterAll, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../lib/db/schema";
import {
  confirmBooking,
  getAvailability,
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

/** A confirmed public-flow hot-desk booking (default 2026-12-01 09:00–11:00 IST). */
export async function bookConfirmed(
  db: TestDb,
  opts: { date?: string; start?: number; duration?: number; seats?: number } = {},
) {
  const window = { date: opts.date ?? "2026-12-01", start: opts.start ?? 9, duration: opts.duration ?? 2 };
  const avail = await getAvailability(db, { planKey: "hotdesk", ...window });
  const resourceIds = avail.filter((a) => a.available).slice(0, opts.seats ?? 1).map((a) => a.resourceId);
  const held = await holdReservation(db, {
    planKey: "hotdesk",
    resourceIds,
    ...window,
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
