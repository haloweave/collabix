import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { confirmBooking, holdReservation, issueTicket } from "../lib/domain/reservations";
import { getTicketView } from "../lib/domain/ticket-view";
import { financialYear, issueInvoiceNo } from "../lib/domain/invoice-number";
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

describe("invoice numbers", () => {
  test("confirmation numbers bookings consecutively within the financial year", async () => {
    const a = await bookConfirmed(ctx.db, { start: 9 });
    const b = await bookConfirmed(ctx.db, { start: 13 });
    const [ra, rb] = await Promise.all(
      [a, b].map(async ({ bookingId }) => {
        const [row] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
        return row;
      }),
    );
    const fy = financialYear(new Date());
    expect(ra.invoiceNo).toBe(`CBX/${fy}/0001`);
    expect(rb.invoiceNo).toBe(`CBX/${fy}/0002`);
    expect(ra.invoicedAt).toBeInstanceOf(Date);
  });

  test("re-confirming keeps the number and does not advance the counter", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    await confirmBooking(ctx.db, { bookingId });
    const again = await ctx.db.transaction((tx) => issueInvoiceNo(tx, bookingId));
    expect(again).toBe(`CBX/${financialYear(new Date())}/0001`);
    const [counter] = await ctx.db.select().from(schema.invoiceCounter);
    expect(counter.last).toBe(1);
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

describe("invoice billing snapshot", () => {
  test("freezes the customer's business details at confirmation", async () => {
    const userId = "snapshot-test-user";
    await ctx.db.delete(schema.billingProfile).where(eq(schema.billingProfile.userId, userId));
    await ctx.db.insert(schema.billingProfile).values({ userId, companyName: "Acme LLP", gstin: "29AAWFC6805H1ZX", address: "Bengaluru" });
    const held = await holdReservation(ctx.db, {
      productKey: "meeting-4", date: "2026-12-01", start: 9, duration: 2,
      customerName: "Test Guest", customerEmail: "guest@example.com",
    });
    if (!held.ok) throw new Error(held.error);
    await confirmBooking(ctx.db, { bookingId: held.bookingId, memberId: userId });

    // A later profile edit must not rewrite the issued invoice.
    await ctx.db.update(schema.billingProfile).set({ companyName: "Renamed Pvt Ltd" }).where(eq(schema.billingProfile.userId, userId));
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, held.bookingId));
    expect(b.billingSnapshot).toEqual({ companyName: "Acme LLP", gstin: "29AAWFC6805H1ZX", address: "Bengaluru" });
    await ctx.db.delete(schema.billingProfile).where(eq(schema.billingProfile.userId, userId));
  });

  test("a customer without business details gets a personal invoice", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
    expect(b.billingSnapshot).toBeNull();
  });
});

describe("invoice backfill migration", () => {
  test("numbers existing confirmed bookings in settlement order and seeds the counter", async () => {
    const a = await bookConfirmed(ctx.db, { start: 9 });
    const b = await bookConfirmed(ctx.db, { start: 13 });
    // Simulate rows confirmed before invoice numbers existed; b settled first.
    await ctx.db.update(schema.booking).set({ invoiceNo: null, invoicedAt: null });
    await ctx.db.delete(schema.invoiceCounter);
    await ctx.db.update(schema.booking).set({ createdAt: new Date(Date.now() - 60_000) }).where(eq(schema.booking.id, b.bookingId));

    const file = readdirSync("./drizzle").find((f) => f.endsWith("_booking_invoice.sql"))!;
    const sql = readFileSync(`./drizzle/${file}`, "utf8");
    await ctx.client.unsafe(sql.slice(sql.indexOf("-- Backfill")));

    const fy = financialYear(new Date());
    const no = async (id: string) =>
      (await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, id)))[0].invoiceNo;
    expect(await no(b.bookingId)).toBe(`CBX/${fy}/0001`);
    expect(await no(a.bookingId)).toBe(`CBX/${fy}/0002`);
    // The next live confirmation carries on from the backfilled serials.
    const c = await bookConfirmed(ctx.db, { start: 16 });
    expect(await no(c.bookingId)).toBe(`CBX/${fy}/0003`);
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
      // Two Half Day Passes: 2 × ₹199 + 18% GST.
      expect(v!.totalMinor).toBe(46964);
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

describe("re-confirming an already-confirmed booking", () => {
  test("cannot reassign the booking to another member", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    const again = await confirmBooking(ctx.db, { bookingId, memberId: "attacker" });
    expect(again.ok).toBe(true);
    expect(again.ok && again.newlyConfirmed).toBe(false);
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, bookingId));
    expect(b.memberId).toBeNull();
  });

  test("a first confirmation reports newlyConfirmed and links the member", async () => {
    const held = await holdReservation(ctx.db, {
      productKey: "meeting-4",
      date: "2026-12-01",
      start: 9,
      duration: 2,
      customerName: "Real Guest",
      customerEmail: "real@example.com",
    });
    if (!held.ok) throw new Error(held.error);
    const first = await confirmBooking(ctx.db, { bookingId: held.bookingId, memberId: "real-member" });
    expect(first.ok && first.newlyConfirmed).toBe(true);
    const [b] = await ctx.db.select().from(schema.booking).where(eq(schema.booking.id, held.bookingId));
    expect(b.memberId).toBe("real-member");
  });
});
