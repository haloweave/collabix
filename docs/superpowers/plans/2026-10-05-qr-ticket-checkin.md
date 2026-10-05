# QR E-Tickets & Scan-to-Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every confirmed booking gets a BookMyShow-style e-ticket (QR code plus details). Staff scan it on a phone, which verifies the booking and checks the guest in in one step.

**Architecture:**
- A random `ticket_token` and a short `ticket_code` are stored on `booking`. Both are issued inside `confirmBooking`, so a future Cashfree success handler gets tickets for free.
- A pure `ticketState()` state machine decides validity. The public `/t/<token>` page and the staff scanner both use it.
- Scan logic lives in a DB-level `scanTicketCore()` (integration-tested), wrapped by a staff-only server action.
- The client scanner uses `qr-scanner`. QR images are rendered server-side with `qrcode`.

**Tech Stack:** Next.js 16 (App Router, server actions, `after`), Drizzle ORM + postgres-js, Postgres 16, Vitest (real-DB integration tests), Tailwind + shadcn/ui, `qrcode`, `qr-scanner`, nodemailer.

**Spec:** `docs/superpowers/specs/2026-10-05-qr-ticket-checkin-design.md`

**Refinements to the spec made while planning (deliberate, small):**
- The migration is split into `0009_booking_ticket` (drizzle-generated columns) and `0010_booking_ticket_backfill` (custom SQL), because drizzle-kit can't mix the two in one file.
- Code layout:
  - `lib/domain/ticket.ts`: pure and client-safe.
  - `lib/domain/ticket-codes.ts`: `node:crypto` generators, server-only.
  - `lib/domain/ticket-display.ts`: copy and formatting, client-safe.
  - `lib/domain/ticket-view.ts`: the DB read model.
  - `lib/domain/checkin.ts`: check-in/out stamps.
  - `lib/domain/scan.ts`: scan logic.
  - The server-only pieces are `lib/ticket-qr.ts` and `lib/ticket-email.ts`.

  This keeps `node:crypto` out of client bundles and lets Vitest import the DB code (Vitest cannot import `server-only`).
- "Multi-day" is detected as `endAt − startAt ≥ 24 h`, so both staff extended bookings and membership long-term holds get per-day check-in.
- Check-in today vs. an earlier day uses one uniform rule for all bookings: a stamp counts only if it falls on today (IST). This removes the need for an `isExtended` branch.
- The admin booking detail page gets a ticket-code link opening `/t/<token>?view=guest`. Without it, staff could not hand extended or walk-in guests their ticket. `?view=guest` forces the guest view, so staff opening it from the admin panel never checks anyone in by accident.
- A membership hold has no price, so its ticket says "Included in membership" instead of an amount.

## Global Constraints

- All `lib/domain/*` files use **relative imports** (`../db/schema`), never `@/…`. `vitest.config.mts` has no path alias, and tests import these files directly.
- Nothing imported by a test may import `"server-only"` or `@/lib/db/client`.
- Client components may only `import type` from `lib/domain/ticket-view.ts` and `lib/domain/scan.ts`. Value imports from `lib/domain/ticket.ts` and `lib/domain/ticket-display.ts` are fine (no Node APIs).
- Token: 16 random bytes, base64url, **22 chars**, regex `^[A-Za-z0-9_-]{22}$`.
- Code: `CBX-` plus 4 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31 chars; no `0 O 1 I L`).
- Check-in window: from **30 min before start until end**. Multi-day bookings use 30 min before `settings.openHour` until `settings.closeHour`, IST, on each day of the range.
- All times are rendered in IST via `lib/admin/format.ts`.
- Payment copy: `"Pay at desk"`, defined once as `PAYMENT_NOTE` in `lib/domain/ticket-display.ts` (it becomes "Paid" once Cashfree lands).
- Audit action `booking.check_in` with `detail.method ∈ "scan" | "code" | "manual" | "override"`.
- Brand: navy `#0B1F3A` (`navy`), gold `#C89B53` (`gold`), ivory `#F7F5F2`, Inter. The Tailwind config already defines `navy` and `gold`.
- **Commits:** the user's global rule is to commit at fine granularity, but **only after the user explicitly says "commit"**. Each task's commit step lists the exact files and message. If commit permission hasn't been given, skip `git commit`, leave the work uncommitted, and continue. Never squash tasks together.
- Work on a new branch, `feat/qr-ticket-checkin`, created from the current `feat/dashboard-lazy-loading` HEAD (that branch is 29 commits ahead of `main` and contains the booking engine this builds on).
- **The tests truncate the `DATABASE_URL` database** (the dev DB), as the existing suite already does. Don't run them against a DB holding data you need.

## Review Focus

1. **IST vs. UTC day boundary.** At 00:10 IST, the UTC date is still yesterday. A booking at 08:00 IST today must read `too_early`, not `other_day`. Test in Task 1.
2. **Typed backup codes with real-world sloppiness** (`cbx 7k4q`, `7K4Q`, `CBX-7K4Q `, `cbx-7k4q`) must resolve. A look-alike character such as `0` or `O` must resolve to `null`, giving "not a valid ticket" rather than a wrong booking. Test in Task 1.
3. **Two phones scanning the same ticket at once** must produce one check-in stamp, and the second phone must show "Already checked in". Test in Task 4.
4. **A ticket screenshot taken before the booking was cancelled** must scan red, with no check-in written. Test in Task 5.
5. **Multi-day booking, day 2, after checking out on day 1:** the scan must check in again (clearing the old check-out), and the reception board must show the guest as not yet checked in on day 2 until then. Tests in Tasks 4 and 5.

---

### Task 0: Prerequisites

- [ ] **Step 1: Start the database**

```bash
sudo systemctl start docker   # the daemon was not running at planning time
cd /home/madcat/Desktop/Projects/collabix/website && docker compose up -d db
```

Expected: `docker ps` shows `collabix-db` with status `healthy`.

- [ ] **Step 2: Branch and baseline**

```bash
git switch -c feat/qr-ticket-checkin
npm run db:migrate && npm test
```

Expected: the migrations apply and the existing suites (`lib/floorplan.test.ts`, `lib/domain/booking.test.ts`, `tests/reservations.test.ts`) pass. If anything fails here, stop and report it: it's pre-existing.

---

### Task 1: Pure ticket domain (tokens, input parsing, state machine, display copy)

**Files:**
- Create: `lib/domain/ticket.ts`, `lib/domain/ticket-codes.ts`, `lib/domain/ticket-display.ts`
- Test: `lib/domain/ticket.test.ts`

**Interfaces:**
- Consumes: `IST_OFFSET_MIN` from `lib/domain/booking.ts`, and `istDate`, `istTime`, `rupees` from `lib/admin/format.ts`.
- Produces:
  - from `ticket.ts`:
    - `CODE_ALPHABET`, `CODE_PREFIX`, `EARLY_CHECKIN_MIN`
    - `isTicketToken(s): boolean`
    - `type TicketLookup = { token: string } | { code: string }`
    - `normalizeTicketInput(raw: string): TicketLookup | null`
    - `istDayStart(d: Date): Date`
    - `isMultiDay(startAt: Date, endAt: Date): boolean`
    - `type TicketPhase`, `type TicketBooking`, `type TicketState`
    - `ticketState(b: TicketBooking, now: Date): TicketState`
  - from `ticket-codes.ts`: `newTicketToken(): string`, `newTicketCode(): string`.
  - from `ticket-display.ts`:
    - `PAYMENT_NOTE`, `VENUE_ADDRESS`, `VENUE_MAPS_URL`
    - `ticketWhen(v: { startAt: Date; endAt: Date }): string`
    - `ticketAmount(v: { totalMinor: number | null }): string`
    - `ticketSeats(v: { seats: number; resourceCodes: string[] }): string`

- [ ] **Step 1: Write the failing tests**

`lib/domain/ticket.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  CODE_ALPHABET,
  istDayStart,
  isTicketToken,
  normalizeTicketInput,
  ticketState,
  type TicketBooking,
} from "./ticket";
import { newTicketCode, newTicketToken } from "./ticket-codes";
import { ticketAmount, ticketSeats, ticketWhen } from "./ticket-display";

const ist = (s: string) => new Date(`${s}:00+05:30`); // "2026-12-01T08:00"

const single = (over: Partial<TicketBooking> = {}): TicketBooking => ({
  status: "active",
  confirmed: true,
  startAt: ist("2026-12-01T09:00"),
  endAt: ist("2026-12-01T11:00"),
  checkedInAt: null,
  checkedOutAt: null,
  openHour: 8,
  closeHour: 20,
  ...over,
});

const multi = (over: Partial<TicketBooking> = {}): TicketBooking =>
  single({
    startAt: ist("2026-12-10T00:00"),
    endAt: ist("2026-12-13T00:00"), // 10th–12th inclusive
    ...over,
  });

describe("token & code generation", () => {
  test("token is 22 url-safe chars and unique", () => {
    const a = newTicketToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(isTicketToken(a)).toBe(true);
    expect(newTicketToken()).not.toBe(a);
  });

  test("code is CBX- plus 4 chars from the look-alike-free alphabet", () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 200; i++) {
      const c = newTicketCode();
      expect(c).toMatch(/^CBX-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    }
  });
});

describe("normalizeTicketInput", () => {
  const token = "AbCdEfGhIjKlMnOpQrSt_-";

  test("full ticket URL, any host, with or without trailing bits", () => {
    expect(normalizeTicketInput(`https://collabix.co.in/t/${token}`)).toEqual({ token });
    expect(normalizeTicketInput(`http://localhost:3000/t/${token}?x=1`)).toEqual({ token });
    expect(normalizeTicketInput(`https://x.trycloudflare.com/t/${token}/`)).toEqual({ token });
  });

  test("bare token", () => {
    expect(normalizeTicketInput(`  ${token} `)).toEqual({ token });
  });

  test("sloppy typed codes resolve", () => {
    for (const raw of ["CBX-7K4Q", "cbx-7k4q", "cbx 7k4q", "7k4q", " CBX7K4Q "]) {
      expect(normalizeTicketInput(raw)).toEqual({ code: "CBX-7K4Q" });
    }
  });

  test("look-alike or junk input is rejected, never guessed", () => {
    for (const raw of ["", "   ", "CBX-7K0Q", "CBX-OK4Q", "CBX-7K4", "CBX-7K4QQ", "hello world", "https://evil.com/x"]) {
      expect(normalizeTicketInput(raw)).toBeNull();
    }
  });
});

describe("istDayStart", () => {
  test("00:10 IST belongs to the IST day even though UTC is still yesterday", () => {
    const d = ist("2026-12-01T00:10"); // 2026-11-30T18:40Z
    expect(istDayStart(d).toISOString()).toBe(ist("2026-12-01T00:00").toISOString());
  });
});

describe("ticketState — single-day", () => {
  test("cancelled / not confirmed win over time", () => {
    expect(ticketState(single({ status: "cancelled" }), ist("2026-12-01T09:30")).phase).toBe("cancelled");
    expect(ticketState(single({ confirmed: false }), ist("2026-12-01T09:30")).phase).toBe("not_confirmed");
  });

  test("window boundaries", () => {
    const b = single();
    expect(ticketState(b, ist("2026-12-01T08:29")).phase).toBe("too_early");
    expect(ticketState(b, ist("2026-12-01T08:30")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-01T10:59")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-01T11:00")).phase).toBe("ended");
  });

  test("just after IST midnight on the booking day is too_early, not other_day", () => {
    expect(ticketState(single(), ist("2026-12-01T00:10")).phase).toBe("too_early");
  });

  test("a different day is other_day; a past day is ended", () => {
    expect(ticketState(single(), ist("2026-11-30T09:30")).phase).toBe("other_day");
    expect(ticketState(single(), ist("2026-12-02T09:30")).phase).toBe("ended");
  });

  test("check-in stamps surface", () => {
    const s = ticketState(
      single({ checkedInAt: ist("2026-12-01T08:50") }),
      ist("2026-12-01T09:30"),
    );
    expect(s.checkedInAt?.toISOString()).toBe(ist("2026-12-01T08:50").toISOString());
    expect(s.checkedOutAt).toBeNull();
    expect(s.multiDay).toBe(false);
  });
});

describe("ticketState — multi-day", () => {
  test("valid each day in range during opening hours", () => {
    const b = multi();
    expect(ticketState(b, ist("2026-12-09T09:00")).phase).toBe("other_day");
    expect(ticketState(b, ist("2026-12-10T07:29")).phase).toBe("too_early");
    expect(ticketState(b, ist("2026-12-10T07:30")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-11T19:59")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-11T20:00")).phase).toBe("ended"); // done for today
    expect(ticketState(b, ist("2026-12-12T12:00")).phase).toBe("valid_now");
    expect(ticketState(b, ist("2026-12-12T20:00")).phase).toBe("ended");
    expect(ticketState(b, ist("2026-12-13T09:00")).phase).toBe("ended");
  });

  test("yesterday's check-in and check-out do not count today", () => {
    const b = multi({
      checkedInAt: ist("2026-12-10T09:00"),
      checkedOutAt: ist("2026-12-10T18:00"),
    });
    const s = ticketState(b, ist("2026-12-11T09:00"));
    expect(s.multiDay).toBe(true);
    expect(s.checkedInAt).toBeNull();
    expect(s.checkedOutAt).toBeNull();
  });
});

describe("display copy", () => {
  test("single-day when line has date and IST time range", () => {
    const w = ticketWhen({ startAt: ist("2026-12-01T09:00"), endAt: ist("2026-12-01T11:00") });
    expect(w).toContain("2026");
    expect(w).toContain("IST");
  });

  test("multi-day when line shows the inclusive last day", () => {
    const w = ticketWhen({ startAt: ist("2026-12-10T00:00"), endAt: ist("2026-12-13T00:00") });
    expect(w).toContain("10");
    expect(w).toContain("12");
    expect(w).not.toContain("13");
  });

  test("amount and seats", () => {
    expect(ticketAmount({ totalMinor: 28320 })).toBe("₹283 · Pay at desk");
    expect(ticketAmount({ totalMinor: null })).toBe("Included in membership");
    expect(ticketSeats({ seats: 2, resourceCodes: ["D-03", "D-04"] })).toBe("2 seats · D-03, D-04");
    expect(ticketSeats({ seats: 1, resourceCodes: ["M-01"] })).toBe("1 seat · M-01");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/domain/ticket.test.ts`
Expected: FAIL with `Failed to resolve import "./ticket"`.

- [ ] **Step 3: Implement `lib/domain/ticket.ts`**

```ts
// E-ticket domain: scan-input parsing and the ticket state machine shared by
// the guest ticket page and the staff scanner. Pure and client-safe — no DB,
// no Node APIs (generators live in ticket-codes.ts).

import { IST_OFFSET_MIN } from "./booking";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0 O 1 I L
export const CODE_PREFIX = "CBX-";
export const EARLY_CHECKIN_MIN = 30;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const IST_MS = IST_OFFSET_MIN * 60_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const URL_TOKEN_RE = /\/t\/([A-Za-z0-9_-]{22})(?:[/?#]|$)/;

export const isTicketToken = (s: string) => TOKEN_RE.test(s);

export type TicketLookup = { token: string } | { code: string };

/** Accepts a scanned ticket URL (any host), a bare token, or a typed backup
 * code in any case/spacing. Returns null rather than guessing. */
export function normalizeTicketInput(raw: string): TicketLookup | null {
  const s = raw.trim();
  if (!s) return null;
  const fromUrl = s.match(URL_TOKEN_RE);
  if (fromUrl) return { token: fromUrl[1] };
  if (TOKEN_RE.test(s)) return { token: s };

  let c = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length === 7 && c.startsWith("CBX")) c = c.slice(3);
  if (c.length !== 4 || [...c].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return { code: CODE_PREFIX + c };
}

/** UTC instant of 00:00 IST on the IST calendar day containing `d`. */
export function istDayStart(d: Date): Date {
  const shifted = d.getTime() + IST_MS;
  return new Date(shifted - (shifted % DAY_MS) - IST_MS);
}

/** Extended bookings and membership holds span whole IST days. */
export const isMultiDay = (startAt: Date, endAt: Date) =>
  endAt.getTime() - startAt.getTime() >= DAY_MS;

export type TicketPhase =
  | "not_confirmed"
  | "cancelled"
  | "other_day"
  | "too_early"
  | "valid_now"
  | "ended";

export type TicketBooking = {
  status: "active" | "cancelled";
  confirmed: boolean;
  startAt: Date;
  endAt: Date;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  openHour: number;
  closeHour: number;
};

export type TicketState = {
  phase: TicketPhase;
  multiDay: boolean;
  /** Earliest allowed check-in for the relevant day. */
  windowStart: Date;
  windowEnd: Date;
  /** Only today's (IST) stamps count — a multi-day booking starts fresh daily. */
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
};

export function ticketState(b: TicketBooking, now: Date): TicketState {
  const today = istDayStart(now);
  const multiDay = isMultiDay(b.startAt, b.endAt);
  const early = EARLY_CHECKIN_MIN * 60_000;

  const windowStart = multiDay
    ? new Date(today.getTime() + b.openHour * HOUR_MS - early)
    : new Date(b.startAt.getTime() - early);
  const windowEnd = multiDay
    ? new Date(today.getTime() + b.closeHour * HOUR_MS)
    : b.endAt;

  const todays = (d: Date | null) => (d && d >= today ? d : null);

  const phase = ((): TicketPhase => {
    if (b.status === "cancelled") return "cancelled";
    if (!b.confirmed) return "not_confirmed";
    if (multiDay) {
      const lastDay = istDayStart(new Date(b.endAt.getTime() - 1));
      if (now.getTime() >= lastDay.getTime() + b.closeHour * HOUR_MS) return "ended";
      if (now < b.startAt) return "other_day";
    } else {
      if (now >= b.endAt) return "ended";
      if (istDayStart(b.startAt).getTime() !== today.getTime()) return "other_day";
    }
    if (now < windowStart) return "too_early";
    if (now >= windowEnd) return "ended";
    return "valid_now";
  })();

  return {
    phase,
    multiDay,
    windowStart,
    windowEnd,
    checkedInAt: todays(b.checkedInAt),
    checkedOutAt: todays(b.checkedOutAt),
  };
}
```

- [ ] **Step 4: Implement `lib/domain/ticket-codes.ts`**

```ts
// Ticket credential generators. Server-only in practice (node:crypto); kept out
// of ticket.ts so client components can import the state machine.

import { randomBytes, randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_PREFIX } from "./ticket";

/** 128-bit opaque token, 22 base64url chars — what the QR link carries. */
export const newTicketToken = () => randomBytes(16).toString("base64url");

/** Short staff-typeable backup code, e.g. CBX-7K4Q. A lookup key behind staff
 * auth, never a bearer credential on its own. */
export function newTicketCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return CODE_PREFIX + s;
}
```

- [ ] **Step 5: Implement `lib/domain/ticket-display.ts`**

```ts
// Ticket copy shared by the guest page, the staff scan card and the email.
// Client-safe. PAYMENT_NOTE flips to "Paid" once Cashfree checkout lands.

import { istDate, istTime, rupees } from "../admin/format";
import { isMultiDay } from "./ticket";

export const PAYMENT_NOTE = "Pay at desk";
export const VENUE_ADDRESS =
  "Collabix Work Lounge, 261, Ashwini Arcade, 3rd Floor, 100 Feet Road, HRBR Layout, Bengaluru, Karnataka 560043";
export const VENUE_MAPS_URL = "https://maps.app.goo.gl/arjxnvUYfqe5oUKX7";

export function ticketWhen(v: { startAt: Date; endAt: Date }): string {
  if (isMultiDay(v.startAt, v.endAt)) {
    return `${istDate(v.startAt)} – ${istDate(new Date(v.endAt.getTime() - 1))}`;
  }
  return `${istDate(v.startAt)} · ${istTime(v.startAt)}–${istTime(v.endAt)} IST`;
}

export function ticketAmount(v: { totalMinor: number | null }): string {
  return v.totalMinor == null
    ? "Included in membership"
    : `${rupees(v.totalMinor)} · ${PAYMENT_NOTE}`;
}

export function ticketSeats(v: { seats: number; resourceCodes: string[] }): string {
  return `${v.seats} seat${v.seats === 1 ? "" : "s"} · ${v.resourceCodes.join(", ")}`;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/domain/ticket.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 7: Commit** (only once the user has said to commit)

```bash
git add lib/domain/ticket.ts lib/domain/ticket-codes.ts lib/domain/ticket-display.ts lib/domain/ticket.test.ts
git commit -m "feat(tickets): add the e-ticket state machine, codes and display copy"
```

---

### Task 2: Ticket columns, backfill, and issuing tickets on confirm

**Files:**
- Modify: `lib/db/schema.ts` (the `booking` table)
- Create (generated): `drizzle/0009_booking_ticket.sql`, `drizzle/0010_booking_ticket_backfill.sql`, plus their `drizzle/meta/*` entries
- Modify: `lib/domain/reservations.ts` (`ConfirmResult`, `confirmBooking`, new `issueTicket`)
- Modify: `app/staff/actions.ts` (`createExtendedBooking`) and `app/admin/(dash)/memberships/actions.ts` (the long-term hold insert near line 145)
- Create: `tests/helpers/tickets.ts`
- Test: `tests/tickets.test.ts`

**Interfaces:**
- Consumes: `newTicketToken` and `newTicketCode` (Task 1).
- Produces:
  - `type Tx` (a drizzle transaction).
  - `issueTicket(tx: Tx, bookingId: string): Promise<{ token: string; code: string }>`.
  - `ConfirmResult = { ok: true; ticketToken: string } | { ok: false; error: string }`.
  - Test helpers `useSeededDb()`, `bookConfirmed(db, opts?)`, and `insertMultiDay(db, startDate, endDate)`, the last two returning `{ bookingId, token, code }`.

- [ ] **Step 1: Add the columns to the schema**

In `lib/db/schema.ts`, inside `booking`, after `status`:

```ts
  // E-ticket (see lib/domain/ticket.ts): opaque QR token + short backup code,
  // issued when the booking is confirmed. Null while only held.
  ticketToken: text("ticket_token").unique(),
  ticketCode: text("ticket_code").unique(),
```

- [ ] **Step 2: Generate the column migration**

Run: `npx drizzle-kit generate --name booking_ticket`
Expected: `drizzle/0009_booking_ticket.sql` contains two `ADD COLUMN` statements (`ticket_token`, `ticket_code`) and two `ADD CONSTRAINT … UNIQUE`. If drizzle-kit shows an interactive prompt, the schema diff picked up something unexpected: stop and inspect.

- [ ] **Step 3: Generate and write the backfill migration**

Run: `npx drizzle-kit generate --custom --name booking_ticket_backfill`
Then replace the body of the new `drizzle/0010_booking_ticket_backfill.sql` with:

```sql
-- Give every already-confirmed active booking an e-ticket (token + code), so
-- bookings made before tickets existed can still be scanned. Idempotent: only
-- touches rows without a token. Same formats as lib/domain/ticket-codes.ts:
-- token = 16 random bytes as unpadded base64url (22 chars); code = CBX- + 4
-- chars from the look-alike-free alphabet.
DO $$
DECLARE
  b record;
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  c text;
  tries int;
BEGIN
  FOR b IN
    SELECT bk.id FROM booking bk
    WHERE bk.status = 'active'
      AND bk.ticket_token IS NULL
      AND EXISTS (
        SELECT 1 FROM reservation r
        WHERE r.booking_id = bk.id AND r.status = 'confirmed'
      )
  LOOP
    tries := 0;
    LOOP
      c := 'CBX-';
      FOR i IN 1..4 LOOP
        c := c || substr(alphabet, 1 + floor(random() * 31)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM booking WHERE ticket_code = c);
      tries := tries + 1;
      IF tries > 50 THEN
        RAISE EXCEPTION 'booking_ticket_backfill: could not allocate a ticket code';
      END IF;
    END LOOP;

    UPDATE booking SET
      ticket_token = rtrim(
        translate(
          encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
          '+/', '-_'),
        '='),
      ticket_code = c
    WHERE id = b.id;
  END LOOP;
END $$;
```

- [ ] **Step 4: Write the test helpers**

`tests/helpers/tickets.ts`:

```ts
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
export function useSeededDb() {
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
```

- [ ] **Step 5: Write the failing tests**

`tests/tickets.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { confirmBooking, issueTicket } from "../lib/domain/reservations";
import { bookConfirmed, insertMultiDay, useSeededDb } from "./helpers/tickets";

const ctx = useSeededDb();
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
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run tests/tickets.test.ts`
Expected: FAIL with `issueTicket` not exported and `ticketToken` missing from the confirm result.

- [ ] **Step 7: Implement `issueTicket` and wire it into `confirmBooking`**

In `lib/domain/reservations.ts`, add an import:

```ts
import { newTicketCode, newTicketToken } from "./ticket-codes";
```

Below `export type Db = …`:

```ts
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
```

Next to `isOverlapViolation`:

```ts
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}
```

At the end of the file:

```ts
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
```

Change `ConfirmResult` and the end of `confirmBooking`'s transaction:

```ts
export type ConfirmResult =
  | { ok: true; ticketToken: string }
  | { ok: false; error: string };
```

```ts
    if (input.memberId) {
      await tx
        .update(schema.booking)
        .set({ memberId: input.memberId })
        .where(eq(schema.booking.id, input.bookingId));
    }
    // The ticket is issued with confirmation — once Cashfree lands, confirmation
    // happens only after payment, so "has a ticket" means "paid".
    const ticket = await issueTicket(tx, input.bookingId);
    return { ok: true as const, ticketToken: ticket.token };
```

(`confirmBooking`'s callback returns a union, so use `as const` on the `ok` literals if TypeScript widens them. `return { ok: false as const, error: … }` is fine on the existing branches.)

- [ ] **Step 8: Issue tickets on the staff direct-insert paths**

In `app/staff/actions.ts` (`createExtendedBooking`), add `import { issueTicket } from "@/lib/domain/reservations";` and change the end of the transaction callback:

```ts
      await tx.insert(schema.reservation).values(
        // …unchanged…
      );
      await issueTicket(tx, b.id);
      return b.id;
```

Make the same two edits in `app/admin/(dash)/memberships/actions.ts`: add the import, and call `await issueTicket(tx, b.id);` right before `return b.id;` inside the long-term-hold transaction.

Then run `rg -n 'status: "confirmed"' app lib` and confirm there are no other insert sites (the plan found exactly these two plus `confirmBooking`).

- [ ] **Step 9: Migrate and run the tests**

Run: `npm run db:migrate && npx vitest run tests/tickets.test.ts tests/reservations.test.ts`
Expected: PASS. `reservations.test.ts` still passes because the `ok: true` checks are unaffected by the extra field.

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Any caller destructuring `ConfirmResult` still compiles.

- [ ] **Step 11: Commit** (only once the user has said to commit). Make two commits:

```bash
git add lib/db/schema.ts drizzle/0009_booking_ticket.sql drizzle/0010_booking_ticket_backfill.sql drizzle/meta
git commit -m "feat(db): add booking ticket token and code with a backfill"
git add lib/domain/reservations.ts app/staff/actions.ts "app/admin/(dash)/memberships/actions.ts" tests/helpers/tickets.ts tests/tickets.test.ts
git commit -m "feat(tickets): issue an e-ticket whenever a booking is confirmed"
```

---

### Task 3: Ticket read model

**Files:**
- Create: `lib/domain/ticket-view.ts`
- Test: `tests/tickets.test.ts` (append)

**Interfaces:**
- Consumes: `Db` (from `reservations.ts`), and `TicketBooking` and `TicketLookup` (Task 1).
- Produces:
  - `type TicketView` with the fields: `bookingId, status, confirmed, customerName, customerEmail, token, code, startAt, endAt, seats, resourceCodes, plan, totalMinor, checkedInAt, checkedOutAt`.
  - `type TicketKey = TicketLookup | { bookingId: string }`.
  - `getTicketView(db: Db, key: TicketKey): Promise<TicketView | null>`.
  - `toTicketBooking(v: TicketView, hours: { openHour: number; closeHour: number }): TicketBooking`.

- [ ] **Step 1: Write the failing tests** (append to `tests/tickets.test.ts`)

```ts
import { getTicketView } from "../lib/domain/ticket-view";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/tickets.test.ts -t getTicketView`
Expected: FAIL with `Failed to resolve import "../lib/domain/ticket-view"`.

- [ ] **Step 3: Implement `lib/domain/ticket-view.ts`**

```ts
// Read model for an e-ticket: one row per booking with everything the guest
// page, the staff scan card and the confirmation email show. Stamps come from
// confirmed reservations only (a staff check-in stamps them all together).

import { sql } from "drizzle-orm";
import type { Db } from "./reservations";
import type { TicketBooking, TicketLookup } from "./ticket";

export type TicketView = {
  bookingId: string;
  status: "active" | "cancelled";
  confirmed: boolean;
  customerName: string;
  /** For the confirmation email only — never rendered on the public page. */
  customerEmail: string;
  token: string;
  code: string;
  startAt: Date;
  endAt: Date;
  seats: number;
  resourceCodes: string[];
  plan: string | null;
  /** null for membership holds, which carry no price. */
  totalMinor: number | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
};

export type TicketKey = TicketLookup | { bookingId: string };

const date = (v: unknown) => (v == null ? null : new Date(v as string));

export async function getTicketView(db: Db, key: TicketKey): Promise<TicketView | null> {
  const where =
    "token" in key
      ? sql`b.ticket_token = ${key.token}`
      : "code" in key
        ? sql`b.ticket_code = ${key.code}`
        : sql`b.id = ${key.bookingId}`;

  const rows = (await db.execute(sql`
    SELECT b.id, b.status, b.customer_name, b.customer_email,
      b.ticket_token, b.ticket_code,
      bool_or(r.status = 'confirmed') AS confirmed,
      min(r.start_at) AS start_at,
      max(r.end_at) AS end_at,
      count(r.id)::int AS seats,
      array_agg(res.code ORDER BY res.code) AS codes,
      (array_agg(DISTINCT rp.name))[1] AS plan,
      (array_agg(r.quote_snapshot ->> 'totalMinor'))[1] AS total_minor,
      max(r.checked_in_at) FILTER (WHERE r.status = 'confirmed') AS checked_in_at,
      CASE WHEN bool_and(r.checked_out_at IS NOT NULL) FILTER (WHERE r.status = 'confirmed')
        THEN max(r.checked_out_at) FILTER (WHERE r.status = 'confirmed')
      END AS checked_out_at
    FROM booking b
    JOIN reservation r ON r.booking_id = b.id AND r.status IN ('confirmed', 'cancelled')
    JOIN resource res ON res.id = r.resource_id
    LEFT JOIN rate_plan rp ON rp.id = r.rate_plan_id
    WHERE ${where} AND b.ticket_token IS NOT NULL
    GROUP BY b.id`)) as unknown as Record<string, unknown>[];

  const r = rows[0];
  if (!r) return null;
  return {
    bookingId: r.id as string,
    status: r.status as "active" | "cancelled",
    confirmed: Boolean(r.confirmed),
    customerName: r.customer_name as string,
    customerEmail: r.customer_email as string,
    token: r.ticket_token as string,
    code: r.ticket_code as string,
    startAt: new Date(r.start_at as string),
    endAt: new Date(r.end_at as string),
    seats: Number(r.seats),
    resourceCodes: Array.isArray(r.codes) ? (r.codes as string[]) : [],
    plan: (r.plan as string | null) ?? null,
    totalMinor: r.total_minor == null ? null : Number(r.total_minor),
    checkedInAt: date(r.checked_in_at),
    checkedOutAt: date(r.checked_out_at),
  };
}

export function toTicketBooking(
  v: TicketView,
  hours: { openHour: number; closeHour: number },
): TicketBooking {
  return {
    status: v.status,
    confirmed: v.confirmed,
    startAt: v.startAt,
    endAt: v.endAt,
    checkedInAt: v.checkedInAt,
    checkedOutAt: v.checkedOutAt,
    openHour: hours.openHour,
    closeHour: hours.closeHour,
  };
}
```

> If `codes` comes back as a Postgres array literal string (`{D-01,D-02}`) instead of a JS array, it means drizzle's postgres-js driver disabled array parsing. In that case, select `array_to_json(array_agg(res.code ORDER BY res.code)) AS codes` instead, which always arrives as a JS array.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/tickets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only once the user has said to commit)

```bash
git add lib/domain/ticket-view.ts tests/tickets.test.ts
git commit -m "feat(tickets): add the ticket read model"
```

---

### Task 4: Day-aware check-in and check-out stamps

**Files:**
- Create: `lib/domain/checkin.ts`
- Modify: `app/admin/(dash)/reception/actions.ts` (`checkInBooking`, `checkOutBooking`)
- Modify: `lib/admin/queries.ts` (`getHereToday`, around line 424)
- Test: `tests/checkin.test.ts`

**Interfaces:**
- Consumes: `istDayStart` (Task 1), `Db`, and the test helpers (Task 2).
- Produces:
  - `stampCheckIn(db: Db, bookingId: string, now?: Date): Promise<boolean>`
  - `stampCheckOut(db: Db, bookingId: string, now?: Date): Promise<boolean>`

  Both return `true` only if this call wrote the stamp.

- [ ] **Step 1: Write the failing tests**

`tests/checkin.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { stampCheckIn, stampCheckOut } from "../lib/domain/checkin";
import { bookConfirmed, insertMultiDay, useSeededDb } from "./helpers/tickets";

const ctx = useSeededDb();
const ist = (s: string) => new Date(`${s}:00+05:30`);

async function stamps(bookingId: string) {
  return ctx.db
    .select({ in: schema.reservation.checkedInAt, out: schema.reservation.checkedOutAt })
    .from(schema.reservation)
    .where(eq(schema.reservation.bookingId, bookingId));
}

describe("stampCheckIn", () => {
  test("stamps every confirmed seat once; a second call is a no-op", async () => {
    const { bookingId } = await bookConfirmed(ctx.db, { seats: 3 });
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-01T08:45"))).toBe(true);
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-01T09:10"))).toBe(false);
    const rows = await stamps(bookingId);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.in?.toISOString()).toBe(ist("2026-12-01T08:45").toISOString());
  });

  test("two concurrent scans write exactly one check-in", async () => {
    const { bookingId } = await bookConfirmed(ctx.db, { seats: 3 });
    const now = ist("2026-12-01T09:00");
    const results = await Promise.all([
      stampCheckIn(ctx.db, bookingId, now),
      stampCheckIn(ctx.db, bookingId, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("multi-day: a new day re-checks-in and clears yesterday's check-out", async () => {
    const { bookingId } = await insertMultiDay(ctx.db, "2026-12-10", "2026-12-12");
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-10T09:00"))).toBe(true);
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-10T18:00"))).toBe(true);
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-10T19:00"))).toBe(false); // same day
    expect(await stampCheckIn(ctx.db, bookingId, ist("2026-12-11T09:05"))).toBe(true);
    const [r] = await stamps(bookingId);
    expect(r.in?.toISOString()).toBe(ist("2026-12-11T09:05").toISOString());
    expect(r.out).toBeNull();
  });
});

describe("stampCheckOut", () => {
  test("only checks out someone checked in today, once", async () => {
    const { bookingId } = await bookConfirmed(ctx.db);
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-01T10:00"))).toBe(false);
    await stampCheckIn(ctx.db, bookingId, ist("2026-12-01T09:00"));
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-01T10:30"))).toBe(true);
    expect(await stampCheckOut(ctx.db, bookingId, ist("2026-12-01T10:40"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/checkin.test.ts`
Expected: FAIL with `Failed to resolve import "../lib/domain/checkin"`.

- [ ] **Step 3: Implement `lib/domain/checkin.ts`**

```ts
// Front-desk attendance stamps on a booking's confirmed reservations. "Checked
// in" is per IST day: a stamp from an earlier day (multi-day bookings) doesn't
// count, so the next day's scan stamps afresh. Both updates are conditional,
// so concurrent scans of one ticket write once.

import { and, eq, gte, isNotNull, isNull, lt, or } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Db } from "./reservations";
import { istDayStart } from "./ticket";

const r = schema.reservation;

/** Returns true if this call checked the booking in. */
export async function stampCheckIn(db: Db, bookingId: string, now = new Date()): Promise<boolean> {
  const today = istDayStart(now);
  const rows = await db
    .update(r)
    .set({ checkedInAt: now, checkedOutAt: null })
    .where(
      and(
        eq(r.bookingId, bookingId),
        eq(r.status, "confirmed"),
        or(isNull(r.checkedInAt), lt(r.checkedInAt, today)),
      ),
    )
    .returning({ id: r.id });
  return rows.length > 0;
}

/** Returns true if this call checked the booking out (only if in today). */
export async function stampCheckOut(db: Db, bookingId: string, now = new Date()): Promise<boolean> {
  const today = istDayStart(now);
  const rows = await db
    .update(r)
    .set({ checkedOutAt: now })
    .where(
      and(
        eq(r.bookingId, bookingId),
        eq(r.status, "confirmed"),
        isNotNull(r.checkedInAt),
        gte(r.checkedInAt, today),
        isNull(r.checkedOutAt),
      ),
    )
    .returning({ id: r.id });
  return rows.length > 0;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/checkin.test.ts`
Expected: PASS.

- [ ] **Step 5: Route the reception actions through the stamps**

In `app/admin/(dash)/reception/actions.ts`, replace `checkInBooking` and `checkOutBooking` (and drop the now-unused `isNull` and `sql` imports only if nothing else in the file uses them: the visitor actions still use both, so keep them):

```ts
import { stampCheckIn, stampCheckOut } from "@/lib/domain/checkin";

export type CheckInMethod = "scan" | "code" | "manual" | "override";

function revalidateFrontDesk() {
  revalidatePath("/admin/reception");
  revalidatePath("/staff");
}

// Manual front-desk check-in (reception board button). Day-aware: a multi-day
// booking can be checked in again on each day of its range.
export async function checkInBooking(bookingId: string) {
  await requireStaff();
  if (await stampCheckIn(db, bookingId)) {
    await logAudit({
      action: "booking.check_in",
      targetType: "booking",
      targetId: bookingId,
      detail: { method: "manual" satisfies CheckInMethod },
    });
  }
  revalidateFrontDesk();
}

export async function checkOutBooking(bookingId: string) {
  await requireStaff();
  if (await stampCheckOut(db, bookingId)) {
    await logAudit({
      action: "booking.check_out",
      targetType: "booking",
      targetId: bookingId,
    });
  }
  revalidateFrontDesk();
}
```

- [ ] **Step 6: Make the reception board day-aware**

In `lib/admin/queries.ts` `getHereToday`, replace the three check-in aggregate lines:

```sql
      bool_and(coalesce(r.checked_in_at >= ${dayStart}::timestamptz, false)) AS checked_in,
      bool_and(coalesce(r.checked_out_at >= ${dayStart}::timestamptz, false)) AS checked_out,
      max(r.checked_in_at) FILTER (WHERE r.checked_in_at >= ${dayStart}::timestamptz) AS checked_in_at
```

(`coalesce` matters: `bool_and` ignores NULLs, so a bare comparison would count "never checked in" as true.)

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 8: Commit** (only once the user has said to commit). Make two commits:

```bash
git add lib/domain/checkin.ts tests/checkin.test.ts
git commit -m "feat(checkin): add day-aware, race-safe check-in and check-out stamps"
git add "app/admin/(dash)/reception/actions.ts" lib/admin/queries.ts
git commit -m "feat(reception): route check-in through the day-aware stamps"
```

---

### Task 5: Scan logic and the `scanTicket` server action

**Files:**
- Create: `lib/domain/scan.ts`
- Modify: `app/admin/(dash)/reception/actions.ts` (add `scanTicket`)
- Test: `tests/scan.test.ts`

**Interfaces:**
- Consumes: `normalizeTicketInput`, `ticketState`, `TicketState` (Task 1); `getTicketView`, `toTicketBooking`, `TicketView` (Task 3); `stampCheckIn` (Task 4); `getSettings` (`lib/settings.ts`).
- Produces:
  - `type ScanMethod = "scan" | "code" | "override"`.
  - `type ScanOutcome = { kind: "invalid" } | { kind: "ticket"; view: TicketView; state: TicketState; justCheckedIn: boolean; method: ScanMethod | null }`.
  - `scanTicketCore(db, raw, opts?: { override?: boolean; now?: Date }): Promise<ScanOutcome>`.
  - Server action `scanTicket(raw: string, opts?: { override?: boolean }): Promise<ScanOutcome>`.

- [ ] **Step 1: Write the failing tests**

`tests/scan.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { scanTicketCore } from "../lib/domain/scan";
import { stampCheckOut } from "../lib/domain/checkin";
import { bookConfirmed, insertMultiDay, useSeededDb } from "./helpers/tickets";

const ctx = useSeededDb();
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/scan.test.ts`
Expected: FAIL with `Failed to resolve import "../lib/domain/scan"`.

- [ ] **Step 3: Implement `lib/domain/scan.ts`**

```ts
// One staff scan: resolve the ticket, decide validity from live state, and —
// if valid now (or too early with an explicit staff override) — check in.
// Auth, audit and cache revalidation live in the server action wrapper.

import { getSettings } from "../settings";
import { stampCheckIn } from "./checkin";
import type { Db } from "./reservations";
import { normalizeTicketInput, ticketState, type TicketState } from "./ticket";
import { getTicketView, toTicketBooking, type TicketView } from "./ticket-view";

export type ScanMethod = "scan" | "code" | "override";

export type ScanOutcome =
  | { kind: "invalid" }
  | {
      kind: "ticket";
      view: TicketView;
      state: TicketState;
      justCheckedIn: boolean;
      method: ScanMethod | null;
    };

export async function scanTicketCore(
  db: Db,
  raw: string,
  opts: { override?: boolean; now?: Date } = {},
): Promise<ScanOutcome> {
  const key = normalizeTicketInput(raw);
  if (!key) return { kind: "invalid" };
  const view = await getTicketView(db, key);
  if (!view) return { kind: "invalid" };

  const now = opts.now ?? new Date();
  const hours = await getSettings(db);
  const state = ticketState(toTicketBooking(view, hours), now);

  const eligible =
    !state.checkedInAt &&
    (state.phase === "valid_now" || (state.phase === "too_early" && !!opts.override));
  if (!eligible) return { kind: "ticket", view, state, justCheckedIn: false, method: null };

  const method: ScanMethod =
    state.phase === "too_early" ? "override" : "token" in key ? "scan" : "code";
  const justCheckedIn = await stampCheckIn(db, view.bookingId, now);
  const fresh = (await getTicketView(db, { bookingId: view.bookingId })) ?? view;
  return {
    kind: "ticket",
    view: fresh,
    state: ticketState(toTicketBooking(fresh, hours), now),
    justCheckedIn,
    method: justCheckedIn ? method : null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/scan.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the server action**

In `app/admin/(dash)/reception/actions.ts`:

```ts
import { scanTicketCore, type ScanOutcome } from "@/lib/domain/scan";

// Staff scan of a guest's e-ticket (QR URL, token, or typed backup code). A
// valid ticket is checked in as part of the scan.
export async function scanTicket(
  raw: string,
  opts?: { override?: boolean },
): Promise<ScanOutcome> {
  await requireStaff();
  const out = await scanTicketCore(db, raw, { override: opts?.override });
  if (out.kind === "ticket" && out.justCheckedIn) {
    await logAudit({
      action: "booking.check_in",
      targetType: "booking",
      targetId: out.view.bookingId,
      detail: { method: out.method },
    });
    revalidateFrontDesk();
  }
  return out;
}
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 7: Commit** (only once the user has said to commit). Make two commits:

```bash
git add lib/domain/scan.ts tests/scan.test.ts
git commit -m "feat(tickets): verify a scanned ticket and check the guest in"
git add "app/admin/(dash)/reception/actions.ts"
git commit -m "feat(reception): add the staff-only scanTicket action"
```

---

### Task 6: QR rendering and the public ticket page

**Files:**
- Modify: `package.json` / `package-lock.json` (add `qrcode`, `@types/qrcode`)
- Create: `lib/ticket-qr.ts`
- Create: `app/t/[token]/page.tsx`, `app/t/[token]/not-found.tsx`, `app/t/[token]/qr.svg/route.ts`, `app/t/[token]/ics/route.ts`
- Create: `components/ticket/ticket-pass.tsx`, `components/ticket/live-refresh.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 3; `getSettings`; `db` from `@/lib/db/client`.
- Produces:
  - `siteUrl(): string`, `ticketUrl(token): string`
  - `ticketQrSvg(token): Promise<string>`, `ticketQrPng(token): Promise<Buffer>`
  - Components `<TicketPass view state qrSvg />` and `<LiveRefresh seconds />`
  - Routes `/t/<token>`, `/t/<token>/qr.svg`, `/t/<token>/ics`

(Task 7 adds the staff branch to the page.)

- [ ] **Step 1: Install the QR library**

Run: `npm install qrcode@^1.5.4 && npm install -D @types/qrcode@^1.5.6`

- [ ] **Step 2: Implement `lib/ticket-qr.ts`**

```ts
import "server-only";
import QRCode from "qrcode";

// Absolute base for ticket links in QR codes and emails. SITE_URL overrides
// (set it to the HTTPS tunnel URL when testing on a phone in dev).
export function siteUrl(): string {
  return (process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const ticketUrl = (token: string) => `${siteUrl()}/t/${token}`;

const QR = {
  errorCorrectionLevel: "M" as const,
  margin: 1,
  color: { dark: "#0B1F3A", light: "#FFFFFF" },
};

export const ticketQrSvg = (token: string) =>
  QRCode.toString(ticketUrl(token), { ...QR, type: "svg" });

export const ticketQrPng = (token: string) =>
  QRCode.toBuffer(ticketUrl(token), { ...QR, type: "png", width: 480 });
```

- [ ] **Step 3: Implement `components/ticket/live-refresh.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-fetches the server-rendered ticket while it's on screen, so the guest
// sees "Checked in" appear moments after reception scans them.
export function LiveRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
```

- [ ] **Step 4: Implement `components/ticket/ticket-pass.tsx`** (server component)

```tsx
import { CalendarPlus, MapPin } from "lucide-react";
import { istTime } from "@/lib/admin/format";
import type { TicketState } from "@/lib/domain/ticket";
import type { TicketView } from "@/lib/domain/ticket-view";
import { ticketAmount, ticketSeats, ticketWhen, VENUE_ADDRESS, VENUE_MAPS_URL } from "@/lib/domain/ticket-display";

function banner(state: TicketState) {
  if (state.phase === "cancelled") return { cls: "bg-red-600", text: "Cancelled" };
  if (state.phase === "not_confirmed") return { cls: "bg-amber-500", text: "Not confirmed" };
  if (state.checkedOutAt) return { cls: "bg-slate-500", text: `Checked out at ${istTime(state.checkedOutAt)}` };
  if (state.checkedInAt) return { cls: "bg-emerald-600", text: `Checked in at ${istTime(state.checkedInAt)}` };
  if (state.phase === "ended") return { cls: "bg-slate-500", text: state.multiDay ? "Done for today" : "Booking ended" };
  return { cls: "bg-emerald-600", text: "Confirmed · show this at reception" };
}

export function TicketPass({ view, state, qrSvg }: { view: TicketView; state: TicketState; qrSvg: string }) {
  const b = banner(state);
  const live = state.phase !== "cancelled" && state.phase !== "not_confirmed";
  return (
    <article className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
      <header className="bg-navy px-6 py-5 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Collabix Work Lounge</p>
        <h1 className="mt-1 text-xl font-semibold">{view.plan ?? "Booking"}</h1>
      </header>
      <div className={`${b.cls} px-6 py-2 text-center text-sm font-medium text-white`} role="status">
        {b.text}
      </div>

      {live && (
        <div className="flex flex-col items-center px-6 pt-6">
          <div
            className="w-56 [&>svg]:h-auto [&>svg]:w-full"
            aria-label="Ticket QR code"
            role="img"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 font-mono text-lg tracking-widest text-navy">{view.code}</p>
        </div>
      )}

      <div className="relative my-5 border-t border-dashed border-[#D9D6D1]">
        <span className="absolute -left-3 -top-3 size-6 rounded-full bg-[#F7F5F2]" />
        <span className="absolute -right-3 -top-3 size-6 rounded-full bg-[#F7F5F2]" />
      </div>

      <dl className="grid gap-3 px-6 pb-6 text-sm">
        <Row label="Guest" value={view.customerName} />
        <Row label="When" value={ticketWhen(view)} />
        <Row label="Seats" value={ticketSeats(view)} mono />
        <Row label="Amount" value={ticketAmount(view)} />
      </dl>

      <footer className="flex gap-2 border-t bg-[#F7F5F2] px-6 py-4 text-sm">
        <a href={VENUE_MAPS_URL} target="_blank" rel="noopener noreferrer"
           className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-white py-2 font-medium text-navy">
          <MapPin className="size-4" /> Directions
        </a>
        {live && (
          <a href={`/t/${view.token}/ics`}
             className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-white py-2 font-medium text-navy">
            <CalendarPlus className="size-4" /> Add to calendar
          </a>
        )}
      </footer>
      <p className="px-6 pb-5 text-center text-xs text-[#4A4F58]">{VENUE_ADDRESS}</p>
    </article>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs uppercase tracking-wider text-[#4A4F58]">{label}</dt>
      <dd className={`text-right font-medium text-navy ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
```

- [ ] **Step 5: Implement the page and its not-found screen**

`app/t/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { isTicketToken, ticketState } from "@/lib/domain/ticket";
import { getTicketView, toTicketBooking } from "@/lib/domain/ticket-view";
import { ticketQrSvg } from "@/lib/ticket-qr";
import { TicketPass } from "@/components/ticket/ticket-pass";
import { LiveRefresh } from "@/components/ticket/live-refresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Collabix ticket",
  robots: { index: false, follow: false },
};

export default async function TicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  if (!isTicketToken(token)) notFound();
  const view = await getTicketView(db, { token });
  if (!view) notFound();

  const settings = await getSettings(db);
  const state = ticketState(toTicketBooking(view, settings), new Date());
  const qrSvg = await ticketQrSvg(token);

  return (
    <main className="min-h-screen bg-[#F7F5F2] px-4 py-8">
      <TicketPass view={view} state={state} qrSvg={qrSvg} />
      <LiveRefresh seconds={15} />
    </main>
  );
}
```

`app/t/[token]/not-found.tsx`:

```tsx
export default function TicketNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F5F2] px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold text-navy">Ticket not found</h1>
        <p className="mt-2 text-sm text-[#4A4F58]">Check the link from your confirmation email.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Implement the QR image and calendar routes**

`app/t/[token]/qr.svg/route.ts`:

```ts
import { db } from "@/lib/db/client";
import { isTicketToken } from "@/lib/domain/ticket";
import { getTicketView } from "@/lib/domain/ticket-view";
import { ticketQrSvg } from "@/lib/ticket-qr";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTicketToken(token) || !(await getTicketView(db, { token }))) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(await ticketQrSvg(token), {
    headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" },
  });
}
```

`app/t/[token]/ics/route.ts`:

```ts
import { db } from "@/lib/db/client";
import { isTicketToken } from "@/lib/domain/ticket";
import { getTicketView } from "@/lib/domain/ticket-view";
import { VENUE_ADDRESS } from "@/lib/domain/ticket-display";
import { ticketUrl } from "@/lib/ticket-qr";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = isTicketToken(token) ? await getTicketView(db, { token }) : null;
  if (!view || view.status !== "active") return new Response("Not found", { status: 404 });

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Collabix//Ticket//EN",
    "BEGIN:VEVENT",
    `UID:${view.bookingId}@collabix.co.in`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(view.startAt)}`,
    `DTEND:${stamp(view.endAt)}`,
    `SUMMARY:${esc(`Collabix · ${view.plan ?? "Booking"} (${view.resourceCodes.join(", ")})`)}`,
    `LOCATION:${esc(VENUE_ADDRESS)}`,
    `URL:${ticketUrl(token)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="collabix-booking.ics"',
    },
  });
}
```

- [ ] **Step 7: Verify in the running app**

Run: `npm run dev` in the background. Then get a token:

```bash
psql "$DATABASE_URL" -Atc "select ticket_token from booking where ticket_token is not null limit 1"
```

If there are none, make a booking on `/booking` first (the dev OTP is printed in the server log). Then:

```bash
T=<token>
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/t/$T              # 200
curl -s localhost:3000/t/$T | grep -c "Collabix Work Lounge"               # ≥1
curl -s localhost:3000/t/$T | grep -c 'noindex'                            # ≥1
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" localhost:3000/t/$T/qr.svg   # 200 image/svg+xml
curl -s localhost:3000/t/$T/ics | head -3                                  # BEGIN:VCALENDAR…
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/t/AAAAAAAAAAAAAAAAAAAAAA    # 404
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/t/not-a-token     # 404
```

Then open `/t/$T` in a browser at 390 px width (Playwright or Chrome DevTools MCP), take a screenshot, and check the following: the QR is visible and scannable, the code sits under it, the details are readable, and nothing scrolls horizontally.

- [ ] **Step 8: Commit** (only once the user has said to commit). Make two commits:

```bash
git add package.json package-lock.json lib/ticket-qr.ts "app/t/[token]/qr.svg/route.ts"
git commit -m "feat(tickets): render ticket QR codes on the server"
git add "app/t/[token]/page.tsx" "app/t/[token]/not-found.tsx" "app/t/[token]/ics/route.ts" components/ticket/ticket-pass.tsx components/ticket/live-refresh.tsx
git commit -m "feat(tickets): add the public e-ticket page with a calendar download"
```

---

### Task 7: Staff scanner (camera, result card, pages, navigation, staff view of `/t`)

**Files:**
- Modify: `package.json` / `package-lock.json` (add `qr-scanner`)
- Create:
  - `components/ticket/use-ticket-check.ts`
  - `components/ticket/scan-result-card.tsx`
  - `components/ticket/staff-ticket-check.tsx`
  - `components/admin/ticket-scanner.tsx`
  - `app/staff/scan/page.tsx`
  - `app/admin/(dash)/scan/page.tsx`
- Modify:
  - `components/admin/staff-nav.tsx`
  - `components/admin/app-sidebar.tsx`
  - `app/staff/page.tsx` (floating Scan button)
  - `lib/admin/auth.ts` (export `isStaff`)
  - `app/t/[token]/page.tsx` (staff branch)

**Interfaces:**
- Consumes: `scanTicket` and `checkOutBooking` (Tasks 4 and 5); `ScanOutcome` (type only); `ticket-display` helpers; `istDate` and `istTime`.
- Produces:
  - `useTicketCheck(): { outcome, busy, failed, submit(raw, opts?), retry(), override(), checkOut(), reset() }`
  - `<ScanResultCard outcome busy onCheckOut onOverride onNext nextLabel />`
  - `<TicketScanner />` and `<StaffTicketCheck raw />`

- [ ] **Step 1: Install the scanner library**

Run: `npm install qr-scanner@^1.4.2`

- [ ] **Step 2: Implement `components/ticket/use-ticket-check.ts`**

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { checkOutBooking, scanTicket } from "@/app/admin/(dash)/reception/actions";
import type { ScanOutcome } from "@/lib/domain/scan";

// Shared state for the camera scanner and the staff view of /t/<token>:
// submit a scanned value, show the outcome, and follow up (override/check out).
export function useTicketCheck() {
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const rawRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const submit = useCallback(async (raw: string, opts?: { override?: boolean }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    rawRef.current = raw;
    setBusy(true);
    setFailed(false);
    try {
      const res = await scanTicket(raw, opts);
      setOutcome(res);
      navigator.vibrate?.(res.kind === "ticket" && res.justCheckedIn ? 80 : [60, 60, 60]);
    } catch {
      // Never show a stale or optimistic green — surface the failure instead.
      setOutcome(null);
      setFailed(true);
      toast.error("Couldn't reach the server — try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (rawRef.current) void submit(rawRef.current);
  }, [submit]);

  const override = useCallback(() => {
    if (rawRef.current) void submit(rawRef.current, { override: true });
  }, [submit]);

  const checkOut = useCallback(async () => {
    if (outcome?.kind !== "ticket" || !rawRef.current) return;
    setBusy(true);
    try {
      await checkOutBooking(outcome.view.bookingId);
      toast.success("Checked out.");
    } catch {
      toast.error("Check-out failed — try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await submit(rawRef.current); // refresh the card from live state
  }, [outcome, submit]);

  const reset = useCallback(() => {
    setOutcome(null);
    setFailed(false);
  }, []);

  return { outcome, busy, failed, submit, retry, override, checkOut, reset };
}
```

- [ ] **Step 3: Implement `components/ticket/scan-result-card.tsx`**

```tsx
"use client";

import { CalendarX, CheckCircle2, Clock, LogOut, UserCheck, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { istDate, istTime } from "@/lib/admin/format";
import { EARLY_CHECKIN_MIN } from "@/lib/domain/ticket";
import { ticketAmount, ticketSeats, ticketWhen } from "@/lib/domain/ticket-display";
import type { ScanOutcome } from "@/lib/domain/scan";

type Head = { tone: string; Icon: LucideIcon; title: string; action?: "checkout" | "override" };

const TONE = {
  green: "bg-emerald-600",
  blue: "bg-sky-600",
  grey: "bg-slate-500",
  amber: "bg-amber-500",
  red: "bg-red-600",
};

function headline(o: ScanOutcome): Head {
  if (o.kind === "invalid") return { tone: TONE.red, Icon: XCircle, title: "Not a valid Collabix ticket" };
  const { state, view, justCheckedIn } = o;
  if (state.phase === "cancelled") return { tone: TONE.red, Icon: XCircle, title: "Cancelled booking" };
  if (state.phase === "not_confirmed") return { tone: TONE.red, Icon: XCircle, title: "Booking not confirmed" };
  if (justCheckedIn) return { tone: TONE.green, Icon: CheckCircle2, title: "Verified · Checked in" };
  if (state.checkedOutAt) return { tone: TONE.grey, Icon: LogOut, title: `Checked out at ${istTime(state.checkedOutAt)}` };
  if (state.checkedInAt)
    return { tone: TONE.blue, Icon: UserCheck, title: `Already checked in at ${istTime(state.checkedInAt)}`, action: "checkout" };
  if (state.phase === "too_early") {
    const starts = state.multiDay
      ? new Date(state.windowStart.getTime() + EARLY_CHECKIN_MIN * 60_000)
      : view.startAt;
    return { tone: TONE.amber, Icon: Clock, title: `Too early — starts ${istTime(starts)}`, action: "override" };
  }
  if (state.phase === "other_day")
    return { tone: TONE.amber, Icon: CalendarX, title: `${state.multiDay ? "Booked from" : "Booked for"} ${istDate(view.startAt)}` };
  if (state.phase === "ended") return { tone: TONE.amber, Icon: Clock, title: `Ended at ${istTime(state.windowEnd)}` };
  return { tone: TONE.green, Icon: CheckCircle2, title: "Verified" };
}

export function ScanResultCard({
  outcome,
  busy,
  onCheckOut,
  onOverride,
  onNext,
  nextLabel = "Scan next",
}: {
  outcome: ScanOutcome;
  busy: boolean;
  onCheckOut: () => void;
  onOverride: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  const h = headline(outcome);
  return (
    <div className="flex min-h-full flex-col bg-background">
      <div className={`${h.tone} flex flex-col items-center gap-3 px-6 py-10 text-center text-white`} role="status" aria-live="assertive">
        <h.Icon className="size-16" aria-hidden />
        <p className="text-2xl font-semibold leading-tight">{h.title}</p>
      </div>

      {outcome.kind === "ticket" && (
        <dl className="grid gap-4 p-6 text-base">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Guest</dt>
            <dd className="text-2xl font-semibold">{outcome.view.customerName}</dd>
          </div>
          <Item label="Plan" value={outcome.view.plan ?? "Booking"} />
          <Item label="Seats" value={ticketSeats(outcome.view)} mono />
          <Item label="When" value={ticketWhen(outcome.view)} />
          <Item label="Amount" value={ticketAmount(outcome.view)} />
          <Item label="Ticket" value={outcome.view.code} mono />
        </dl>
      )}

      <div className="mt-auto grid gap-3 p-6">
        {h.action === "checkout" && (
          <Button size="lg" variant="outline" disabled={busy} onClick={onCheckOut}>Check out</Button>
        )}
        {h.action === "override" && (
          <Button size="lg" variant="outline" disabled={busy} onClick={onOverride}>Check in anyway</Button>
        )}
        <Button size="lg" disabled={busy} onClick={onNext}>{nextLabel}</Button>
      </div>
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Implement `components/admin/ticket-scanner.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { Flashlight, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanResultCard } from "@/components/ticket/scan-result-card";
import { useTicketCheck } from "@/components/ticket/use-ticket-check";

const REPEAT_MS = 5000; // ignore the same QR re-read within this window

type CameraState = "starting" | "on" | "denied" | "unavailable" | "insecure";

export function TicketScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [hasFlash, setHasFlash] = useState(false);
  const [code, setCode] = useState("");
  const check = useTicketCheck();
  const submitRef = useRef(check.submit);
  submitRef.current = check.submit;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext) return setCamera("insecure");
      const { default: Scanner } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      if (!(await Scanner.hasCamera())) return setCamera("unavailable");
      const scanner = new Scanner(
        videoRef.current,
        (result) => {
          const value = result.data;
          const last = lastRef.current;
          if (last && last.value === value && Date.now() - last.at < REPEAT_MS) return;
          lastRef.current = { value, at: Date.now() };
          scanner.pause();
          void submitRef.current(value);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
      );
      scannerRef.current = scanner;
      try {
        await scanner.start();
        if (cancelled) return;
        setCamera("on");
        setHasFlash(await scanner.hasFlash());
      } catch {
        if (!cancelled) setCamera("denied");
      }
    })();
    return () => {
      cancelled = true;
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  function next() {
    check.reset();
    setCode("");
    void scannerRef.current?.start();
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    scannerRef.current?.pause();
    void check.submit(code);
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        {camera !== "on" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">
            {camera === "starting" && <Loader2 className="size-6 animate-spin" aria-label="Starting camera" />}
            {camera === "denied" && "Camera access was blocked. Allow camera for this site in your browser settings, then reload — or type the ticket code below."}
            {camera === "unavailable" && "No camera found on this device. Type the ticket code below."}
            {camera === "insecure" && "The camera needs a secure (https) connection. Type the ticket code below."}
          </div>
        )}
        {hasFlash && (
          <Button type="button" size="icon" variant="secondary" className="absolute right-3 top-3"
                  aria-label="Toggle torch" onClick={() => void scannerRef.current?.toggleFlash()}>
            <Flashlight className="size-4" />
          </Button>
        )}
      </div>

      <form onSubmit={submitCode} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ticket code, e.g. CBX-7K4Q"
               autoCapitalize="characters" autoComplete="off" className="font-mono" aria-label="Ticket code" />
        <Button type="submit" disabled={check.busy || !code.trim()}>Check</Button>
      </form>

      {check.busy && !check.outcome && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Verifying…</p>
      )}
      {check.failed && (
        <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Couldn&apos;t verify — check your connection.
          <Button size="sm" variant="outline" onClick={check.retry}><RotateCw className="size-4" /> Retry</Button>
        </div>
      )}

      {check.outcome && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <ScanResultCard outcome={check.outcome} busy={check.busy}
                          onCheckOut={() => void check.checkOut()} onOverride={check.override} onNext={next} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the scan pages**

`app/staff/scan/page.tsx`:

```tsx
import type { Metadata } from "next";
import { TicketScanner } from "@/components/admin/ticket-scanner";

export const metadata: Metadata = { title: "Scan ticket · Collabix Staff" };

export default function StaffScanPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scan ticket</h1>
        <p className="text-sm text-muted-foreground">Point at the guest&apos;s QR code — a valid ticket checks them in.</p>
      </div>
      <TicketScanner />
    </div>
  );
}
```

`app/admin/(dash)/scan/page.tsx`: identical body, with `metadata.title` set to `"Scan ticket · Collabix Admin"` and the function named `AdminScanPage`. The `(dash)` layout already guards it.

- [ ] **Step 6: Add the navigation entries**

In `components/admin/staff-nav.tsx`, put `{ title: "Scan", href: "/staff/scan" }` **first** in `TABS`.

In `components/admin/app-sidebar.tsx`, import `ScanLine` from `lucide-react` and add `{ title: "Scan ticket", href: "/admin/scan", icon: ScanLine },` right after the Reception entry.

In `app/staff/page.tsx`, add `ScanLine` to the lucide import and append this inside the outer `<div className="space-y-6">` of `StaffHome`:

```tsx
      <Link
        href="/staff/scan"
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground shadow-lg md:hidden"
      >
        <ScanLine className="size-5" /> Scan
      </Link>
```

- [ ] **Step 7: Add the staff view of `/t/<token>`**

In `lib/admin/auth.ts`, change `function isStaff(` to `export function isStaff(`.

`components/ticket/staff-ticket-check.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScanResultCard } from "@/components/ticket/scan-result-card";
import { useTicketCheck } from "@/components/ticket/use-ticket-check";

// A signed-in staff member opened a ticket link (e.g. via the phone's own
// camera app): treat it as a scan. Runs as a server action after mount, never
// during render, so prefetchers/link scanners can't check anyone in.
export function StaffTicketCheck({ raw }: { raw: string }) {
  const router = useRouter();
  const check = useTicketCheck();
  const started = useRef(false);
  const { submit } = check;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void submit(raw);
  }, [raw, submit]);

  if (check.outcome) {
    return (
      <ScanResultCard outcome={check.outcome} busy={check.busy}
                      onCheckOut={() => void check.checkOut()} onOverride={check.override}
                      onNext={() => router.push("/staff/scan")} nextLabel="Open scanner" />
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-sm text-muted-foreground">
      {check.failed ? (
        <Button variant="outline" onClick={check.retry}><RotateCw className="size-4" /> Retry</Button>
      ) : (
        <><Loader2 className="size-6 animate-spin" /> Verifying ticket…</>
      )}
    </div>
  );
}
```

In `app/t/[token]/page.tsx`, add the staff branch. Use the real session only: under `ADMIN_AUTH_DISABLED`, `getSessionUser()` is still the real session, so guests in dev keep the guest view. `?view=guest` forces the guest view.

```tsx
import { getSessionUser, isStaff } from "@/lib/admin/auth";
import { Toaster } from "@/components/ui/sonner";
import { StaffTicketCheck } from "@/components/ticket/staff-ticket-check";

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const { view: viewParam } = await searchParams;
  if (!isTicketToken(token)) notFound();
  const view = await getTicketView(db, { token });
  if (!view) notFound();

  const user = await getSessionUser();
  if (viewParam !== "guest" && user && isStaff(user.role)) {
    return (
      <div className="admin-scope min-h-screen">
        <StaffTicketCheck raw={token} />
        <Toaster />
      </div>
    );
  }
  // …guest view unchanged…
}
```

- [ ] **Step 8: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean. If the build fails on `qr-scanner`'s worker import, check that the dynamic `import("qr-scanner")` sits inside `useEffect` (it must never be imported at module scope in a server-rendered file).

- [ ] **Step 9: Verify on a real phone**

1. Run `npm run dev`, then `cloudflared tunnel --url http://localhost:3000` (or `npx localtunnel --port 3000`).
2. Set `SITE_URL=<https tunnel url>` and `BETTER_AUTH_URL=<same>` in `.env`, then restart dev so QR codes point at the tunnel and staff cookies work on it.
3. Sign in on the phone at `<tunnel>/admin/login` as a reception user (seed one with `npm run db:seed:owner` if needed) and open `/staff/scan`.
4. On a laptop, open a ticket `/t/<token>` for a booking happening **now**, and scan it from the phone. Expect a green "Verified · Checked in" card and a vibration.
5. Scan the same ticket again. Expect blue "Already checked in", then **Check out** gives grey "Checked out at …".
6. Scan a ticket for a booking later today. Expect amber "Too early", then **Check in anyway** gives green.
7. Cancel a booking in `/admin/bookings`, then scan its ticket. Expect red "Cancelled booking".
8. Type a backup code in the field. It should behave the same as scanning the QR.
9. Deny camera permission. Expect the explanation text, with the code field still working.
10. Open a ticket URL with the phone's **native camera app** while signed in as staff. Expect the staff card. Signed out (private tab), expect the guest ticket.
11. Check that `/staff` (the reception board) shows the scanned guest as checked in.
12. Test on both iOS Safari and Android Chrome if available.

- [ ] **Step 10: Commit** (only once the user has said to commit). Make five commits:

```bash
git add package.json package-lock.json components/ticket/use-ticket-check.ts components/ticket/scan-result-card.tsx
git commit -m "feat(scanner): add the scan result card and its check-in state hook"
git add components/admin/ticket-scanner.tsx
git commit -m "feat(scanner): add the camera ticket scanner with a backup-code field"
git add app/staff/scan/page.tsx "app/admin/(dash)/scan/page.tsx"
git commit -m "feat(scanner): add scan pages for the staff console and the admin panel"
git add components/admin/staff-nav.tsx components/admin/app-sidebar.tsx app/staff/page.tsx
git commit -m "feat(scanner): link the scanner from staff and admin navigation"
git add lib/admin/auth.ts components/ticket/staff-ticket-check.tsx "app/t/[token]/page.tsx"
git commit -m "feat(tickets): show staff the check-in card when they open a ticket link"
```

---

### Task 8: Show the ticket to the guest (success screen, My bookings, admin link)

**Files:**
- Modify: `app/api/bookings/confirm/route.ts`
- Modify: `app/(site)/booking/booking.tsx`
- Modify: `lib/account/queries.ts` and `app/account/(portal)/page.tsx`
- Modify: `lib/admin/queries.ts` (`getBooking` and the `BookingDetail` type) and `app/admin/(dash)/bookings/[id]/page.tsx`

**Interfaces:**
- Consumes: `ConfirmResult.ticketToken` (Task 2), `/t/<token>` and `/t/<token>/qr.svg` (Task 6).
- Produces:
  - The confirm API JSON becomes `{ ok: true, ticketToken: string }`.
  - `MyBooking.ticketToken: string | null`.
  - `BookingDetail.ticketToken` and `BookingDetail.ticketCode`, both `string | null`.

- [ ] **Step 1: Return the token from the confirm API**

In `app/api/bookings/confirm/route.ts`, change the success line:

```ts
  return NextResponse.json({ ok: true, ticketToken: result.ticketToken });
```

- [ ] **Step 2: Show the QR on the success screen**

In `app/(site)/booking/booking.tsx`:

- Add `const [ticketToken, setTicketToken] = useState<string | null>(null);` next to `confirmedCodes`.
- In the confirm handler, after `setConfirmedCodes(selectedCodes);`, add `setTicketToken(data.ticketToken ?? null);`.
- In `restart()`, add `setTicketToken(null);`.
- In the `label === "Done"` block, insert this right after the closing `</div>` of `confirm-details`:

```tsx
                {ticketToken && (
                  <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered SVG QR */}
                    <img
                      src={`/t/${ticketToken}/qr.svg`}
                      alt="Your booking QR code"
                      width={200}
                      height={200}
                      style={{ margin: "0 auto", background: "#fff", padding: 8, borderRadius: 12 }}
                    />
                    <p style={{ fontSize: ".85rem", marginTop: ".5rem" }}>
                      Show this QR at reception to check in. We&#39;ve emailed it to you too.
                    </p>
                    <a className="btn btn-gold" href={`/t/${ticketToken}`} style={{ marginTop: ".75rem" }}>
                      View ticket <span className="arw">→</span>
                    </a>
                  </div>
                )}
```

- [ ] **Step 3: Add the Ticket link to My bookings**

In `lib/account/queries.ts`:
- Add `ticketToken: string | null;` to `MyBooking`.
- Add `b.ticket_token,` to the SELECT (after `b.status`).
- Map it with `ticketToken: (r.ticket_token as string) ?? null,`.

In `app/account/(portal)/page.tsx`, inside `Row`'s right-hand `<div className="flex items-center gap-2">`, before the Badge:

```tsx
          {b.ticketToken && b.status === "active" && b.confirmed && (
            <Link href={`/t/${b.ticketToken}`} className="text-sm font-medium underline underline-offset-4">
              Ticket
            </Link>
          )}
```

- [ ] **Step 4: Add the ticket link to the admin booking detail page**

In `lib/admin/queries.ts`, add `ticketToken: string | null; ticketCode: string | null;` to `BookingDetail`. In `getBooking`'s return, add:

```ts
    ticketToken: (b.ticket_token as string) ?? null,
    ticketCode: (b.ticket_code as string) ?? null,
```

In `app/admin/(dash)/bookings/[id]/page.tsx`, extend the subtitle paragraph:

```tsx
              {booking.customerEmail} · booked {istDate(booking.createdAt)}
              {booking.ticketToken && (
                <>
                  {" · ticket "}
                  <Link href={`/t/${booking.ticketToken}?view=guest`} target="_blank" className="font-mono underline underline-offset-4">
                    {booking.ticketCode}
                  </Link>
                </>
              )}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`. Then, with `npm run dev`:
1. Book on `/booking`; the OTP is in the server log.
2. The Done step shows the QR and a **View ticket** link that opens the ticket.
3. `/account` shows a **Ticket** link on the booking (sign in through the portal login).
4. `/admin/bookings/<id>` shows the ticket code. The link opens the **guest** view even though you're signed in as staff, and nothing gets checked in. Confirm the latter with `psql -c "select checked_in_at from reservation where booking_id='<id>'"`.

- [ ] **Step 6: Commit** (only once the user has said to commit). Make four commits:

```bash
git add app/api/bookings/confirm/route.ts
git commit -m "feat(booking): return the ticket token when a booking is confirmed"
git add "app/(site)/booking/booking.tsx"
git commit -m "feat(booking): show the ticket QR on the booking success screen"
git add lib/account/queries.ts "app/account/(portal)/page.tsx"
git commit -m "feat(account): link each booking to its e-ticket"
git add lib/admin/queries.ts "app/admin/(dash)/bookings/[id]/page.tsx"
git commit -m "feat(admin): show the ticket code on the booking detail page"
```

---

### Task 9: Confirmation email with the QR

**Files:**
- Modify: `lib/email.ts` (attachments)
- Create: `lib/ticket-email.ts`
- Modify: `app/api/bookings/confirm/route.ts` (send via `after`)

**Interfaces:**
- Consumes: `getTicketView` (Task 3), `ticketQrPng` and `ticketUrl` (Task 6), and the `ticket-display` helpers (Task 1).
- Produces: `sendTicketEmail(bookingId: string): Promise<void>`. `sendEmail` gains `attachments?: { filename; content: Buffer; contentType?; cid? }[]`.

- [ ] **Step 1: Support attachments in `sendEmail`**

In `lib/email.ts`:

```ts
type Attachment = { filename: string; content: Buffer; contentType?: string; cid?: string };
type Mail = { to: string; subject: string; text: string; html?: string; attachments?: Attachment[] };
```

In the dev branch, change the log to

```ts
`[email:dev] to=${mail.to} subject="${mail.subject}"${mail.attachments?.length ? ` (+${mail.attachments.length} attachment)` : ""}\n${mail.text}`
```

and add `attachments: mail.attachments,` to `transport.sendMail({...})`.

- [ ] **Step 2: Implement `lib/ticket-email.ts`**

```ts
import "server-only";
import { db } from "@/lib/db/client";
import { istDate } from "@/lib/admin/format";
import { getTicketView } from "@/lib/domain/ticket-view";
import { ticketAmount, ticketSeats, ticketWhen, VENUE_ADDRESS } from "@/lib/domain/ticket-display";
import { sendEmail } from "@/lib/email";
import { ticketQrPng, ticketUrl } from "@/lib/ticket-qr";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Booking confirmation with the e-ticket. The QR is a CID-referenced PNG
// attachment because Gmail strips inline SVG and data: URIs.
export async function sendTicketEmail(bookingId: string): Promise<void> {
  const v = await getTicketView(db, { bookingId });
  if (!v || v.status !== "active" || !v.confirmed) return;

  const url = ticketUrl(v.token);
  const details: [string, string][] = [
    ["Plan", v.plan ?? "Booking"],
    ["Seats", ticketSeats(v)],
    ["When", ticketWhen(v)],
    ["Amount", ticketAmount(v)],
    ["Ticket code", v.code],
  ];

  const text = [
    `Hi ${v.customerName},`,
    "",
    "Your Collabix booking is confirmed. Show the QR code at reception to check in.",
    "",
    ...details.map(([k, val]) => `${k}: ${val}`),
    "",
    `Your ticket: ${url}`,
    "",
    "Collabix Work Lounge",
    VENUE_ADDRESS,
  ].join("\n");

  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0B1F3A">
  <div style="background:#0B1F3A;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0">
    <div style="color:#C89B53;font-size:12px;letter-spacing:.2em;text-transform:uppercase">Collabix Work Lounge</div>
    <div style="font-size:20px;font-weight:600;margin-top:4px">You're booked in</div>
  </div>
  <div style="border:1px solid #D9D6D1;border-top:0;border-radius:0 0 16px 16px;padding:24px;text-align:center">
    <p style="margin:0 0 16px">Hi ${esc(v.customerName)}, show this QR at reception to check in.</p>
    <img src="cid:ticket-qr" width="220" height="220" alt="Ticket QR code" style="display:block;margin:0 auto" />
    <div style="font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.15em;margin:8px 0 20px">${esc(v.code)}</div>
    <table style="width:100%;font-size:14px;text-align:left;border-collapse:collapse">
      ${details.map(([k, val]) => `<tr><td style="color:#4A4F58;padding:4px 0">${esc(k)}</td><td style="text-align:right;font-weight:600">${esc(val)}</td></tr>`).join("")}
    </table>
    <a href="${esc(url)}" style="display:inline-block;margin-top:20px;background:#C89B53;color:#0B1F3A;padding:12px 20px;border-radius:999px;font-weight:600;text-decoration:none">View ticket</a>
    <p style="font-size:12px;color:#4A4F58;margin-top:20px">${esc(VENUE_ADDRESS)}</p>
  </div>
</div>`;

  await sendEmail({
    to: v.customerEmail,
    subject: `Booking confirmed · ${istDate(v.startAt)} · Collabix`,
    text,
    html,
    attachments: [
      { filename: "collabix-ticket.png", content: await ticketQrPng(v.token), contentType: "image/png", cid: "ticket-qr" },
    ],
  });
}
```

- [ ] **Step 3: Send it after the confirm response**

In `app/api/bookings/confirm/route.ts`:

```ts
import { NextResponse, after } from "next/server";
import { sendTicketEmail } from "@/lib/ticket-email";
```

Just before the success `return`:

```ts
  // Email the ticket after responding, so SMTP latency never slows checkout
  // and an email failure never fails the booking.
  after(async () => {
    try {
      await sendTicketEmail(parsed.data.bookingId);
    } catch (e) {
      console.error("[ticket-email] send failed", e);
    }
  });
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`.

With `npm run dev` and no SMTP configured, make a booking. The server log should print `[email:dev] to=… subject="Booking confirmed · …" (+1 attachment)` followed by the text body, including the ticket URL and code, and the booking's Done step should appear without waiting on the email.

If SMTP creds are available, set them and send to a real Gmail inbox: the QR image must render inline and scan from the phone.

- [ ] **Step 5: Commit** (only once the user has said to commit). Make two commits:

```bash
git add lib/email.ts
git commit -m "feat(email): support attachments in sendEmail"
git add lib/ticket-email.ts app/api/bookings/confirm/route.ts
git commit -m "feat(tickets): email the e-ticket with its QR code on confirmation"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full checks**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: every suite passes, and the typecheck, lint and production build are all clean. Paste the summary lines into the report.

- [ ] **Step 2: End-to-end pass**

Re-run Task 7 Step 9 (real phone over the tunnel) start to finish on the production build (`npm run build && npm start` behind the tunnel), plus Task 8 Step 5 and Task 9 Step 4. Record which phones and browsers were tested, and anything that didn't behave.

- [ ] **Step 3: Audit trail**

As a manager, open `/admin/audit` and check that each check-in shows `booking.check_in` with the right `method` (`scan`, `code`, `override`, `manual`), and that each check-out appears.

- [ ] **Step 4: Report**

Summarize what shipped, the verification evidence, and any follow-ups. Known follow-ups:
- Cashfree checkout, after which `PAYMENT_NOTE` becomes "Paid".
- Optional re-entry after a check-out on the same day.
