import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { scanTicketCore } from "../lib/domain/scan";
import { stampCheckOut } from "../lib/domain/checkin";
import { bookConfirmed, insertMultiDay, setupSeededDb } from "./helpers/tickets";

const ctx = setupSeededDb();
const ist = (s: string) => new Date(`${s}:00+05:30`);
const url = (t: string) => `https://collabix.co.in/t/${t}`;

describe("scanTicketCore", () => {
  test("valid now: the first scan checks in, the second reports already in", async () => {
    const { token } = await bookConfirmed(ctx.db); // 09:00–11:00 on 2026-12-01
    const now = ist("2026-12-01T08:45");
    const first = await scanTicketCore(ctx.db, url(token), { now });
    expect(first.kind).toBe("ticket");
    if (first.kind !== "ticket") return;
    expect(first.justCheckedIn).toBe(true);
    expect(first.method).toBe("scan");
    expect(first.state.phase).toBe("valid_now");
    expect(first.state.checkedInAt).not.toBeNull();

    const second = await scanTicketCore(ctx.db, url(token), { now: ist("2026-12-01T08:50") });
    if (second.kind !== "ticket") throw new Error("expected ticket");
    expect(second.justCheckedIn).toBe(false);
    expect(second.state.checkedInAt?.toISOString()).toBe(now.toISOString());
  });

  test("typed backup code checks in with method 'code'", async () => {
    const { code } = await bookConfirmed(ctx.db);
    const out = await scanTicketCore(ctx.db, code.toLowerCase().replace("-", " "), { now: ist("2026-12-01T09:30") });
    if (out.kind !== "ticket") throw new Error("expected ticket");
    expect(out.justCheckedIn).toBe(true);
    expect(out.method).toBe("code");
  });

  test("too early: no check-in unless overridden", async () => {
    const { token } = await bookConfirmed(ctx.db);
    const now = ist("2026-12-01T08:00");
    const plain = await scanTicketCore(ctx.db, token, { now });
    if (plain.kind !== "ticket") throw new Error("expected ticket");
    expect(plain.state.phase).toBe("too_early");
    expect(plain.justCheckedIn).toBe(false);

    const forced = await scanTicketCore(ctx.db, token, { now, override: true });
    if (forced.kind !== "ticket") throw new Error("expected ticket");
    expect(forced.justCheckedIn).toBe(true);
    expect(forced.method).toBe("override");
  });

  test("override is ignored on another day and after the end", async () => {
    const { token } = await bookConfirmed(ctx.db);
    for (const now of [ist("2026-11-30T09:30"), ist("2026-12-01T11:00")]) {
      const out = await scanTicketCore(ctx.db, token, { now, override: true });
      if (out.kind !== "ticket") throw new Error("expected ticket");
      expect(out.justCheckedIn).toBe(false);
      expect(["other_day", "ended"]).toContain(out.state.phase);
    }
  });

  test("a ticket for a since-cancelled booking scans as cancelled and writes nothing", async () => {
    const { bookingId, token } = await bookConfirmed(ctx.db);
    await ctx.db.update(schema.reservation).set({ status: "cancelled" }).where(eq(schema.reservation.bookingId, bookingId));
    await ctx.db.update(schema.booking).set({ status: "cancelled" }).where(eq(schema.booking.id, bookingId));
    const out = await scanTicketCore(ctx.db, url(token), { now: ist("2026-12-01T09:30"), override: true });
    if (out.kind !== "ticket") throw new Error("expected ticket");
    expect(out.state.phase).toBe("cancelled");
    expect(out.justCheckedIn).toBe(false);
    const rows = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.bookingId, bookingId));
    expect(rows.every((r) => r.checkedInAt === null)).toBe(true);
  });

  test("garbage, unknown tokens and unknown codes are invalid", async () => {
    await bookConfirmed(ctx.db);
    for (const raw of ["", "hello", url("AAAAAAAAAAAAAAAAAAAAAA"), "CBX-2222"]) {
      expect((await scanTicketCore(ctx.db, raw)).kind).toBe("invalid");
    }
  });

  test("multi-day: checked out yesterday, scanning today checks in again", async () => {
    const { bookingId, token } = await insertMultiDay(ctx.db, "2026-12-10", "2026-12-12");
    await scanTicketCore(ctx.db, token, { now: ist("2026-12-10T09:00") });
    await stampCheckOut(ctx.db, bookingId, ist("2026-12-10T18:00"));
    const out = await scanTicketCore(ctx.db, token, { now: ist("2026-12-11T09:00") });
    if (out.kind !== "ticket") throw new Error("expected ticket");
    expect(out.justCheckedIn).toBe(true);
    expect(out.state.checkedOutAt).toBeNull();
  });
});
