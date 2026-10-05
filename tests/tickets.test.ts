import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { confirmBooking, issueTicket } from "../lib/domain/reservations";
import { getTicketView } from "../lib/domain/ticket-view";
import { ticketIcs } from "../lib/domain/ticket-ics";
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

describe("getTicketView", () => {
  test("finds a booking by token, code and id with aggregated details", async () => {
    const { bookingId, token, code } = await bookConfirmed(ctx.db, { seats: 2 });
    for (const key of [{ token }, { code }, { bookingId }]) {
      const v = await getTicketView(ctx.db, key);
      expect(v).not.toBeNull();
      expect(v!.bookingId).toBe(bookingId);
      expect(v!.token).toBe(token);
      expect(v!.code).toBe(code);
      expect(v!.status).toBe("active");
      expect(v!.confirmed).toBe(true);
      expect(v!.seats).toBe(2);
      expect(v!.resourceCodes).toHaveLength(2);
      expect([...v!.resourceCodes].sort()).toEqual(v!.resourceCodes);
      expect(v!.plan).toBeTruthy();
      expect(v!.totalMinor).toBe(2 * 2 * 12000 + Math.round(2 * 2 * 12000 * 0.18));
      expect(v!.startAt).toBeInstanceOf(Date);
      expect(v!.checkedInAt).toBeNull();
    }
  });

  test("unknown token or code returns null", async () => {
    expect(await getTicketView(ctx.db, { token: "AAAAAAAAAAAAAAAAAAAAAA" })).toBeNull();
    expect(await getTicketView(ctx.db, { code: "CBX-2222" })).toBeNull();
  });

  test("a cancelled booking still resolves, as cancelled", async () => {
    const { bookingId, token } = await bookConfirmed(ctx.db);
    await ctx.db.update(schema.reservation).set({ status: "cancelled" }).where(eq(schema.reservation.bookingId, bookingId));
    await ctx.db.update(schema.booking).set({ status: "cancelled" }).where(eq(schema.booking.id, bookingId));
    const v = await getTicketView(ctx.db, { token });
    expect(v!.status).toBe("cancelled");
    expect(v!.confirmed).toBe(false);
  });

  test("membership-style holds have no amount", async () => {
    const { token } = await insertMultiDay(ctx.db, "2026-12-10", "2026-12-12");
    await ctx.db.update(schema.reservation).set({ quoteSnapshot: { membershipHold: true } });
    expect((await getTicketView(ctx.db, { token }))!.totalMinor).toBeNull();
  });
});

describe("public ticket surfaces never expose the booking id", () => {
  test("the .ics calendar file identifies the event by ticket token, not booking id", async () => {
    const { bookingId, token } = await bookConfirmed(ctx.db);
    const view = (await getTicketView(ctx.db, { token }))!;
    const ics = ticketIcs(view, `https://collabix.co.in/t/${token}`);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`UID:${token}@collabix.co.in`);
    expect(ics).not.toContain(bookingId);
  });
});

