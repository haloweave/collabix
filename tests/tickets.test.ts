import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { confirmBooking, issueTicket } from "../lib/domain/reservations";
import { bookConfirmed, insertMultiDay, setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const CODE = /^CBX-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

async function ticketOf(bookingId: string) {
  const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
  return { token: b.ticketToken, code: b.ticketCode };
}

describe("issuing tickets", () => {
  test("confirmBooking issues a token + code and returns the token", async () => {
    const { bookingId, token } = await bookConfirmed(ctx.db);
    expect(token).toMatch(TOKEN);
    const t = await ticketOf(bookingId);
    expect(t.token).toBe(token);
    expect(t.code).toMatch(CODE);
  });

  test("re-confirming and re-issuing never changes the ticket", async () => {
    const { bookingId, token } = await bookConfirmed(ctx.db);
    const before = await ticketOf(bookingId);
    const again = await confirmBooking(ctx.db, { bookingId });
    expect(again.ok && again.ticketToken).toBe(token);
    const issued = await ctx.db.transaction((tx) => issueTicket(tx, bookingId));
    expect(issued).toEqual(before);
  });

  test("staff-style direct inserts get tickets via issueTicket", async () => {
    const { token, code } = await insertMultiDay(ctx.db, "2026-12-10", "2026-12-12");
    expect(token).toMatch(TOKEN);
    expect(code).toMatch(CODE);
  });
});

describe("backfill migration", () => {
  test("gives existing confirmed bookings a ticket and skips cancelled ones", async () => {
    const a = await bookConfirmed(ctx.db, { start: 9 });
    const c = await bookConfirmed(ctx.db, { start: 13 });
    // Simulate pre-ticket rows.
    await ctx.db.update(schema.booking).set({ ticketToken: null, ticketCode: null });
    await ctx.db.update(schema.booking).set({ status: "cancelled" }).where(eq(schema.booking.id, c.bookingId));

    const file = readdirSync("./drizzle").find((f) => f.endsWith("_booking_ticket_backfill.sql"))!;
    await ctx.client.unsafe(readFileSync(`./drizzle/${file}`, "utf8"));

    const ta = await ticketOf(a.bookingId);
    expect(ta.token).toMatch(TOKEN);
    expect(ta.code).toMatch(CODE);
    expect(await ticketOf(c.bookingId)).toEqual({ token: null, code: null });
  });
});

