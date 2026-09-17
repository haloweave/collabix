# Booking engine core — design

Date: 2026-09-17. Status: approved for planning. Slice 1 of the Collabix
production platform (see `docs/coworking-architecture.md` for the full audit and
phased rollout). Open-source references consulted live: UpSpace
(`ivanreeve/upspace`) and WARP (`sebo-b/warp`) — concepts translated to our
stack, no code copied.

## Goal

A real, concurrency-safe booking backend on local Docker Postgres + Drizzle,
with the existing `/home/booking` UI wired to live availability and real
hold/confirm. This is the core every later slice (payments, invoices,
memberships) attaches to. The headline guarantee: **two concurrent requests for
the same seat and time window — exactly one succeeds.**

## Scope

**In:**
- Postgres schema + Drizzle models + migrations, run on local Docker Postgres.
- Resource model (location → floor → zone → resource) seeded with placeholder
  inventory matching the demo.
- Rate plans separate from resources (a desk is bookable at hot-desk or
  dedicated rates).
- Server-authoritative availability, quote, hold, confirm.
- Double-booking prevention via a Postgres exclusion constraint.
- `/home/booking` UI wired to live availability + real hold/confirm, with a
  visible hold **countdown** (BookMyShow-style).
- **Passwordless auth (Better Auth)** as a parallel vertical: email OTP / magic
  link + phone SMS OTP, dev console transport.
- **Guest-first checkout with OTP-verified lazy account creation** — the booking
  attaches to the member created/linked at the checkout OTP step.
- Integration tests (Vitest) against real Postgres.

**Out (deferred to later slices — YAGNI here):**
- Recurring bookings.
- Payments, invoicing, memberships/credits, coupons.
- Admin dashboard, visitor log, reporting, notifications.
- A durable background job runner (hold expiry is swept lazily; see below).
- Real email / SMS providers (dev logs the OTP to the console). Note: the
  proposal excludes an SMS/OTP gateway — phone OTP is an added launch cost.

## Checkout + identity (BookMyShow-validated)

Observed on BookMyShow (live, 2026-09-17): browse → showtime → seat map all run
anonymously; a hold timer starts at seat selection; identity is captured by
mobile **OTP at the pay transition**, creating/linking the account then. Our
funnel mirrors this:

1. Guest selects space → date/time → seat with no login wall (existing flow).
2. At the details step they enter name + phone (or email).
3. `hold` reserves the seat with a countdown; the client shows the remaining time.
4. Sending + verifying the OTP (Better Auth `phoneNumber` / `emailOTP` with
   `signUpOnVerification`) establishes the member — new account if unknown,
   matched if returning.
5. `confirm` attaches the held reservation's `booking.memberId` to that member.

Better Auth owns `user`/`session`/`account`/`verification` in `lib/db/auth-schema.ts`
and mounts at `app/api/auth/[...all]/route.ts`; it shares the same Postgres.

## Inventory caveat

Actual inventory is unconfirmed — `docs/coworking-architecture.md` records the
conflict between the homepage's "120 seats", the older 24+12 seat spec, and the
demo's single 12-seat bank `D-01…D-12`. This slice **seeds the demo's model as
clearly-labeled placeholder data**: 12 desks (`D-01…D-12`), 2 cabins
(`C-01`,`C-02`), 1 meeting room (`M-01`). Real inventory replaces the seed before
launch; nothing in the engine depends on these counts.

## Data model

Hierarchy and reservation split follow WARP's seat/zone model and the
architecture doc's `Location → Floor → Zone → Resource`. Rate plan is distinct
from the physical resource (the demo prices one desk bank at two rates).

```
location(id, name, timezone default 'Asia/Kolkata')
floor(id, location_id, name)
zone(id, floor_id, name, kind)                     -- kind: 'desk_bank' | 'room'
resource(id, zone_id, code, kind, capacity,        -- kind: 'desk' | 'room'
         x, y, enabled)                             -- code e.g. 'D-01'; x/y for floorplan (WARP-style)
rate_plan(id, key, name, applies_to_kind,          -- applies_to_kind: 'desk' | 'room'
          rate_minor, currency default 'INR', active)
booking(id, customer_name, customer_email,         -- no auth yet; inline capture
        status, created_at)                         -- status: 'active' | 'cancelled'
reservation(id, booking_id, resource_id, rate_plan_id,
            start_at timestamptz, end_at timestamptz,
            period tstzrange generated,             -- generated: tstzrange(start_at, end_at, '[)')
            status, hold_expires_at timestamptz,    -- status: 'held' | 'confirmed' | 'expired' | 'cancelled'
            quote_snapshot jsonb,                    -- price breakdown captured server-side (UpSpace pattern)
            idempotency_key text, created_at)
```

Notes:
- **Money in integer minor units** (`rate_minor`, and amounts inside
  `quote_snapshot`), currency INR. No floats.
- **Times stored UTC** (`timestamptz`), rendered `Asia/Kolkata`. Simpler than
  WARP's wall-clock+timezone because Collabix is single-location; revisit if
  multi-city.
- **Half-open `[start, end)`** intervals via the generated `period` column so
  adjacent bookings (08–10, 10–12) don't collide.
- `quote_snapshot` freezes the server-computed price at hold time (UpSpace stores
  a price-rule snapshot on the booking). One reservation per booking in this
  slice; the booking/reservation split leaves room for multi-item later.
- A reservation validates `rate_plan.applies_to_kind == resource.kind`.

## Concurrency — the crux

A native Postgres exclusion constraint makes overlapping held/confirmed
reservations for the same resource impossible at the database level. This is
where we improve on both references: UpSpace enforces overlap only in app code
+ an index; WARP uses an application trigger. We use the database itself.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservation
  ADD CONSTRAINT reservation_no_overlap
  EXCLUDE USING gist (resource_id WITH =, period WITH &&)
  WHERE (status IN ('held', 'confirmed'));
```

- Drizzle cannot express `EXCLUDE`/`CREATE EXTENSION`, so these live in a
  hand-written SQL migration applied after Drizzle's generated migration. The
  generated `period` column is likewise added by raw SQL if drizzle-kit can't
  emit a `GENERATED ALWAYS AS`.
- **Hold expiry:** holds get `hold_expires_at = now() + 10 min`. The constraint
  cannot reference `now()` (the architecture doc explicitly warns against a
  volatile `now()` predicate in an index), so expired holds are swept to
  `expired` lazily inside a transaction at the start of each availability and
  hold call: `UPDATE reservation SET status='expired' WHERE status='held' AND
  hold_expires_at < now()`. A confirmed reservation never expires. **Flag:**
  production needs a real scheduled job; the lazy sweep is a documented interim.

## API — Next.js route handlers

All inputs validated with zod; all prices and time rules computed server-side;
the client is never trusted for money or availability.

- `GET /api/availability?date=YYYY-MM-DD&start=HH&duration=N&plan=<key>`
  Sweeps expired holds, then returns each resource matching the plan's
  `applies_to_kind` with `available: boolean` for the requested window
  (`[start, end)` overlap against held/confirmed reservations).
- `POST /api/bookings/quote` `{ plan, start, duration }`
  Returns `{ rate_minor, hours, subtotal_minor, tax_minor, total_minor }`
  (18% tax as in the demo — flagged indicative, not a verified tax config).
- `POST /api/bookings/hold` `{ plan, resourceId, date, start, duration,
  customerName, customerEmail, idempotencyKey }`
  Creates a `booking` + `held` reservation with `quote_snapshot`. Exclusion
  violation → `409 { error: 'seat_unavailable' }`. Idempotency key returns the
  existing hold instead of duplicating.
- `POST /api/bookings/confirm` `{ reservationId }`
  In a transaction: `SELECT … FOR UPDATE`, reject if expired/not held, set
  `confirmed`. No payment gate in this slice (confirm is direct).

Server validation rules (shared in `lib/domain`): hours 08–20, duration ∈
{1,2,4,8}, `start + duration ≤ 20`, date not in the past (Asia/Kolkata),
`Asia/Kolkata` → UTC conversion.

## Directory layout (per architecture doc)

```
lib/db/schema.ts        Drizzle table definitions
lib/db/client.ts        postgres.js connection + Drizzle instance
lib/db/seed.ts          placeholder inventory + rate plans
lib/domain/booking.ts   pure rules: window validation, price computation, tz
app/api/availability/route.ts
app/api/bookings/quote/route.ts
app/api/bookings/hold/route.ts
app/api/bookings/confirm/route.ts
drizzle/                generated + hand-written SQL migrations
docker-compose.yml      postgres:16
drizzle.config.ts
.env / .env.example     DATABASE_URL
```

## UI wiring

`app/home/booking/booking.tsx`:
- Replace the fake `taken(date, seat)` hash with a fetch to `/api/availability`
  for the chosen plan/date/window; grey out unavailable resources from real data.
- On the Details step, `POST /api/bookings/hold` then `/api/bookings/confirm`;
  show a real confirmation (reservation id, resource code, window, total from the
  server quote) instead of the "no space reserved" preview copy.
- Keep the existing multi-step structure, styling, and accessibility.

## New dependencies

`drizzle-orm`, `drizzle-kit`, `postgres` (postgres.js driver), `zod`, and
`vitest` (dev) with an integration setup that points at the Docker Postgres.

## Testing (TDD)

Integration tests against real Docker Postgres — concurrency correctness cannot
be tested without it (this is why the DB choice is Postgres, not SQLite):

1. **Race:** two concurrent holds for the same resource+window → exactly one
   `201`, one `409`. (Headline guarantee.)
2. **Adjacency:** `[08,10)` then `[10,12)` on one resource → both succeed.
3. **Overlap:** `[08,10)` then `[09,11)` → second rejected.
4. **Expiry:** a held reservation past `hold_expires_at` → the seat is available
   again after the sweep, and a new hold succeeds.
5. **Rate-plan/kind mismatch:** hot-desk plan on a room resource → rejected.
6. **Window validation:** out-of-hours start, bad duration, past date → rejected.
7. **Quote:** server total = rate × hours + 18% tax, in minor units.

Unit tests for `lib/domain/booking.ts` pure functions (window validation, price,
tz conversion) run without a database.

## Acceptance

- All tests above pass against Docker Postgres.
- `/home/booking` reflects real availability and produces a confirmed reservation
  persisted in the database.
- `npm run lint` and TypeScript checks pass.
- Placeholder inventory and the lazy-sweep interim are clearly labeled in code
  and README.

## Explicitly not guaranteed by this slice

No authentication, payment, invoice, membership, admin, visitor, notification, or
reporting behavior. No recurring bookings. No production job runner. These are
later slices in `docs/coworking-architecture.md`.
