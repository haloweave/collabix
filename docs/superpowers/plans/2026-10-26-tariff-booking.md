# Booking on the Published Tariff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make online and walk-in booking sell exactly the tariff's bookable products (Full Day Pass, Half Day Pass, Meeting Room 4-seater, The Boardroom) at exactly the tariff's prices, on tariff inventory, through a low-friction step 1.

**Architecture:** `lib/tariff.ts` becomes the single source: a typed catalogue derived from the same rows `/pricing` renders. A pure `priceBooking` replaces `computeQuote`; the reservation engine resolves products to resources and windows; `rate_plan` stays only as the registry reservations reference. Part B (Corporate Bundles) gets its own plan.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle + Postgres, Vitest, zod.

**Spec:** `docs/superpowers/specs/2026-10-26-tariff-booking-design.md`

## Global Constraints

- Prices come only from `lib/tariff.ts`. Bookable: Full Day Pass ₹399/person, Half Day Pass ₹199/person (4-hour block), Meeting Room (4-seater) ₹350/hr, The Boardroom ₹750/hr.
- 18% GST on everything (tariff), not `settings.taxPercent`.
- Rooms: +20% per hour falling in 20:00–07:00 IST. Passes: no night charge.
- Full Day Pass = 08:00–20:00. Half Day Pass = 4-hour block starting 08:00–16:00. Rooms = any start 0–23, 1–12 whole hours, overnight allowed.
- Inventory: 28 desks (D-01…D-28), cabins C-01…C-04, M-01 = The Boardroom (8), M-02 = Meeting Room (4-seater).
- Early Bird: if `earlyBirdOpen()` is true, passes and rooms use their `earlyBird` price; today it is false.
- Integration tests (`tests/*.ts`) truncate the shared local DB: run them only with the user's OK.
- Production data changes only through the migration script in Task 6, run only with the user's go-ahead.
- Commit each task separately (user rule: small focused commits; wait for the user's "commit"/"start implementing" go-ahead, which has been given for this plan).

## Review Focus

- A room booking straddling 20:00 or 07:00 (e.g. 19:00–22:00, 06:00–09:00) must charge night rate only for the night hours — tested in Task 2.
- An overnight room booking crossing midnight (22:00 + 6 h) prices 6 night hours — tested in Task 2.
- Booking today after 16:00 must not offer a Half Day Pass start in the past, and after 20:00 must not offer today's Full Day Pass — tested in Task 3 (`productWindow` with `now`).
- A pass for more people than free desks must be refused server-side, not just in the UI — tested in Task 4.
- Holding a room product must only ever reserve its own room (M-01 for Boardroom, M-02 for 4-seater) even if a client posts another room's id — tested in Task 4.

---

### Task 1: Tariff catalogue

**Files:**
- Modify: `lib/tariff.ts`
- Test: `lib/tariff.test.ts` (create)

**Interfaces:**
- Produces:
  - `export type ProductKey = "day-full" | "day-half" | "meeting-4" | "boardroom"`
  - `export const PRODUCT_KEYS: readonly [ProductKey, ...ProductKey[]]`
  - `export type BookableProduct = { key: ProductKey; name: string; blurb: string; kind: "pass" | "room"; unit: "person" | "hour"; priceMinor: number; earlyBirdMinor: number | null; roomCode: "M-01" | "M-02" | null }`
  - `export const BOOKABLE: readonly BookableProduct[]` (in the order above)
  - `export function bookableProduct(key: string): BookableProduct | undefined`
  - `export function productPriceMinor(p: BookableProduct, now?: Date): number` (early-bird price while `earlyBirdOpen(now)`, else standard)
  - `export const GST_RATE = 0.18; export const NIGHT_SURCHARGE = 0.2; export const NIGHT_FROM = 20; export const NIGHT_UNTIL = 7;`

- [ ] **Step 1: Write the failing test** `lib/tariff.test.ts`:
  - `"bookable prices come from the tariff rows"`: `bookableProduct("day-full")!.priceMinor === 39900`, `day-half` 19900, `meeting-4` 35000, `boardroom` 75000; `earlyBirdMinor` 37500 / 17500 / 30000 / 70000.
  - `"names match the tariff rows"`: names `"Full Day Pass"`, `"Half Day Pass"`, `"Meeting Room (4-seater)"`, `"The Boardroom"`; roomCode null/null/"M-02"/"M-01".
  - `"productPriceMinor uses early bird only while open"`: with `new Date("2026-10-10T06:00:00Z")` → 37500 for day-full; with `new Date("2026-10-26T06:00:00Z")` → 39900.
  - `"unknown key"`: `bookableProduct("hotdesk") === undefined`.
- [ ] **Step 2: Run** `npx vitest run lib/tariff.test.ts` — FAIL (exports missing).
- [ ] **Step 3: Implement** in `lib/tariff.ts`. Look rows up by name from `tariff` (`passes` and `meeting` sections) so the catalogue can never drift from `/pricing`; throw at module load if a row is missing. Rename the meeting rows to `"Meeting Room (4-seater)"` / `"The Boardroom"` only if they differ (they already match).
- [ ] **Step 4: Run** `npx vitest run lib/tariff.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(tariff): add the bookable product catalogue derived from the tariff`.

### Task 2: Tariff pricing (`priceBooking`)

**Files:**
- Modify: `lib/domain/booking.ts`
- Test: `lib/domain/booking.test.ts`

**Interfaces:**
- Consumes: Task 1 `BookableProduct`, `productPriceMinor`, `GST_RATE`, `NIGHT_*`.
- Produces:
  - `export function nightHours(start: number, duration: number): number` — count of the `duration` hours starting at `start` whose hour-of-day (mod 24) is ≥ 20 or < 7.
  - `export type QuoteLine = { label: string; qty: number; unitMinor: number; amountMinor: number }`
  - `export type Quote = { productKey: string; rateMinor: number; hours: number; seats: number; lines: QuoteLine[]; subtotalMinor: number; taxMinor: number; totalMinor: number }` (`rateMinor`/`hours`/`seats` kept for existing snapshot readers)
  - `export function priceBooking(p: BookableProduct, window: WindowInput, people: number, now?: Date): Quote`
  - `TAX_RATE` re-exported as `GST_RATE`; `computeQuote` deleted.

- [ ] **Step 1: Write failing tests** (replace the `computeQuote` block):
  - `nightHours(9, 3) === 0`, `nightHours(19, 3) === 2`, `nightHours(6, 3) === 1`, `nightHours(22, 6) === 6`, `nightHours(18, 12) === 10`.
  - Full Day Pass, 3 people: lines `[{label:"Full Day Pass", qty:3, unitMinor:39900, amountMinor:119700}]`, subtotal 119700, tax 21546, total 141246.
  - Half Day Pass, 1 person: subtotal 19900, tax 3582, total 23482.
  - Boardroom 19:00 + 3 h: lines `[{label:"The Boardroom", qty:1, unitMinor:75000, amountMinor:75000}, {label:"The Boardroom · after hours (+20%)", qty:2, unitMinor:90000, amountMinor:180000}]`, subtotal 255000, tax 45900, total 300900.
  - Meeting Room 22:00 + 6 h: one after-hours line qty 6 unitMinor 42000, subtotal 252000.
  - Rooms ignore `people` (seats = 1).
- [ ] **Step 2: Run** `npx vitest run lib/domain/booking.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Night unit = `Math.round(unit * (1 + NIGHT_SURCHARGE))`; omit zero-qty lines; tax = `Math.round(subtotal * GST_RATE)`.
- [ ] **Step 4: Run** — PASS. Then `npx tsc --noEmit -p .` lists the callers of `computeQuote` (fixed in Task 4).
- [ ] **Step 5: Commit** `feat(booking): price bookings from the tariff with the after-hours charge`.

### Task 3: Product windows

**Files:**
- Modify: `lib/domain/booking.ts`
- Test: `lib/domain/booking.test.ts`

**Interfaces:**
- Produces: `export function productWindow(p: BookableProduct, input: { date: string; start?: number; duration?: number }, now: Date): { ok: true; window: WindowInput } | { ok: false; error: string }`, plus `export const PASS_DAY = { start: 8, end: 20 } as const; export const HALF_DAY_HOURS = 4;`.

- [ ] **Step 1: Failing tests** (`NOW` = 2026-09-17 12:00 IST as in the file):
  - day-full on 2026-09-18 → window `{date, start: 8, duration: 12}`; start/duration inputs ignored.
  - day-full today (2026-09-17) at 12:00 → ok; at 20:30 IST → `{ok:false}`.
  - day-half start 16 → `{start:16, duration:4}`; start 17 or 7 → error; today start 11 at 12:00 IST → error (past).
  - room start 22 duration 6 → ok; start 24 or duration 13 → error (delegates to `validateWindow`); today start 11 at 12:00 → error.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** A window is "past" if its start instant (`toUtcWindow`) is before `now`, except day-full which is valid until 20:00 IST on that date.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(booking): derive each product's booking window`.

### Task 4: Inventory and reservation engine on the catalogue

**Files:**
- Modify: `lib/floorplan.ts`, `lib/floorplan.test.ts`, `lib/domain/reservations.ts`, `lib/api/validation.ts`, `app/api/bookings/quote/route.ts`, `app/api/availability/route.ts`, `app/api/rates/route.ts`, `lib/rates.ts`
- Test: `lib/floorplan.test.ts`, `tests/reservations.test.ts`, `tests/tickets.test.ts`, `tests/payments.test.ts`, `tests/helpers/*.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `floorplan.ts`: 28 desks; rooms `M-01` (zone "Meeting", label "The Boardroom", capacity 8), `M-02` (zone "Meeting", label "Meeting Room (4-seater)", capacity 4), `C-01`…`C-04` (zone "Cabins", capacity 4). `export function registryKeyFor(r: { code: string; kind: "desk" | "room" }): string` → desk `"desk-membership"`, `C-*` `"cabin-membership"`, `M-01` `"boardroom"`, `M-02` `"meeting-4"`.
  - `getAvailability(db, { productKey, date, start?, duration? })` → `{ resources: Slot[]; window: WindowInput }`; passes list the enabled desks, rooms list only their `roomCode`.
  - `HoldInput` loses `planKey`/`start`/`duration` required-ness: `{ productKey; people; date; start?; duration?; resourceIds?; customerName; customerEmail; idempotencyKey?; holdMinutes? }`. Passes auto-assign `people` free desks with `autoAssignDesks`; rooms take their room. `resourceIds` from a client is ignored for rooms and, for passes, accepted only if all are free desks.
  - `quoteBody = { productKey, date, start?, duration?, people }`; `availabilityQuery = { productKey, date, start?, duration? }`; `holdBody` mirrors `HoldInput`; zod enum is `PRODUCT_KEYS`.
  - `/api/rates` returns `Record<ProductKey, number>` whole rupees from `productPriceMinor`.
- [ ] **Step 1: Failing tests.** `floorplan.test.ts`: 28 desks; rooms codes `["M-01","M-02","C-01","C-02","C-03","C-04"]`; `registryKeyFor` cases. `tests/reservations.test.ts` (rewrite plan keys): hold `day-full` for 3 people → 3 desks, total 141246; 29 people → `{ok:false,error:"not_enough_desks"}`; hold `boardroom` posting M-02's id → reservation is on M-01; `meeting-4` 19:00+3h total 140420 (2×42000+35000=119000, tax 21420).
- [ ] **Step 2: Run** `npx vitest run lib/floorplan.test.ts` — FAIL. (Integration: ask the user before `npx vitest run tests`.)
- [ ] **Step 3: Implement.** Delete `PLAN_ZONE`; plan row = `rate_plan` where `key = productKey` (must exist, `active`); use `productWindow` then `priceBooking`; store the quote in `quoteSnapshot` unchanged in shape. Remove the `settings` window check (closed dates stay).
- [ ] **Step 4: Run** `npx vitest run lib` and `npx tsc --noEmit -p .` — PASS (UI callers fixed in Tasks 9–10; a temporary type error there is expected only if tasks run out of order).
- [ ] **Step 5: Commit** `feat(booking): reserve and price tariff products on tariff inventory`.

### Task 5: Registry rows for seed, holds and extended bookings

**Files:**
- Modify: `lib/db/seed.ts`, `app/staff/actions.ts:84-103`, `app/admin/(dash)/memberships/actions.ts:139-160`, `lib/admin/queries.ts:880-895` (`getResourceRates`)

**Interfaces:**
- Consumes: `registryKeyFor`, `BOOKABLE`.
- Produces: seed rate plans = the 4 products (`rateMinor` = `priceMinor`, active) + `desk-membership` "Desk (membership)" and `cabin-membership` "Private Cabin (membership)" (`rateMinor` 0, `active` false). Holds/extended pick `ratePlanId` by `registryKeyFor(resource)`. `getResourceRates` (interim until Part 2): desks = Full Day Pass ÷ 12 per hour, `M-01`/`M-02` = their hourly price, cabins = 0.
- [ ] **Step 1:** Adjust `tests/helpers/db.ts` expectations if they name old keys; write a unit test for `getResourceRates`'s pure mapping if extracted (`rateForCode(code, kind)` in `lib/tariff.ts`: `D-01` → 3325, `M-01` → 75000, `M-02` → 35000, `C-01` → 0).
- [ ] **Step 2:** Run the unit test — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run lib`, `npx tsc --noEmit -p .` — PASS.
- [ ] **Step 5: Commit** `feat(admin): point member holds and extended bookings at registry rows`.

### Task 6: Production data migration script

**Files:**
- Create: `lib/db/migrate-tariff.ts`; Modify: `package.json` (script `"db:tariff": "tsx lib/db/migrate-tariff.ts"` matching existing `db:*` script style)

**Interfaces:**
- Produces an idempotent script: disable desks not in `seats()` (`enabled=false`); insert missing `seats()` resources (C-03, C-04, M-02) into their zones (create zone "Cabins"/"Meeting" if absent); set old plans `hotdesk`, `dedicated`, `cabin`, `meeting` `active=false`; upsert the 6 registry rows from Task 5. Prints a summary; never deletes rows.
- [ ] **Step 1:** Run it twice against the **local** DB (`set -a; . ./.env; set +a; npm run db:tariff`); second run reports no changes.
- [ ] **Step 2:** Verify locally: `select code, enabled from resource order by code` shows D-29…D-44 disabled, C-03/C-04/M-02 present; `select key, active from rate_plan`.
- [ ] **Step 3: Commit** `feat(db): add the tariff inventory and product migration`. (Running it on production waits for the user.)

### Task 7: Remove price editing that the tariff now fixes

**Files:**
- Delete: `app/admin/(dash)/rate-plans/` (page, actions), `components/admin/rate-plan-editor.tsx`; Modify: `components/admin/app-sidebar.tsx:53`, `lib/admin/queries.ts` (drop `listRatePlans` if only the page used it), `components/admin/settings-form.tsx`, `app/admin/(dash)/settings/actions.ts`, `app/admin/(dash)/billing/actions.ts:39` (tax = `GST_RATE`)
- [ ] **Step 1:** Remove; settings form/action no longer read or write `taxPercent` (column stays in DB).
- [ ] **Step 2:** `npx tsc --noEmit -p .` and `npx eslint app/admin components/admin` — clean; `/admin/rate-plans` 404s in dev.
- [ ] **Step 3: Commit** `chore(admin): drop rate and tax editing now fixed by the tariff`.

### Task 8: Tickets say "Any shared desk" for passes

**Files:**
- Modify: `lib/domain/ticket-view.ts` (select `rp.key AS plan_key`, add `planKey: string | null` to `TicketView`), `lib/domain/ticket-display.ts` (`ticketSeats`)
- Test: `lib/domain/ticket.test.ts`
- [ ] **Step 1: Failing test:** `ticketSeats({ seats: 2, resourceCodes: ["D-03","D-04"], planKey: "day-full" }) === "2 people · Any shared desk"`; `{ seats: 1, resourceCodes: ["M-01"], planKey: "boardroom" }` → `"The Boardroom"`; legacy `planKey: null` keeps today's `"2 seats · D-03, D-04"`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run `npx vitest run lib` — PASS.
- [ ] **Step 5: Commit** `feat(tickets): show "Any shared desk" on day-pass tickets`.

### Task 9: Staff walk-in on the catalogue

**Files:**
- Modify: `components/admin/walk-in-form.tsx`, `app/admin/(dash)/bookings/actions.ts:57-139`
- [ ] **Step 1:** Form offers the 4 products; people stepper for passes; start (Half Day 08–16, rooms 0–23) and length (rooms 1–12) only where the product needs them; coupon field and coupon logic removed from walk-in.
- [ ] **Step 2:** Action calls `holdReservation` with `HoldInput` from Task 4 and `confirmBooking`; zod-parse the input with `holdBody` minus contact fields.
- [ ] **Step 3:** `npx tsc --noEmit -p .`; in dev, book a Boardroom walk-in at `/admin/bookings/new` and check the booking detail total equals the tariff price.
- [ ] **Step 4: Commit** `feat(admin): book walk-ins from the tariff products`.

### Task 10: Step 1 of `/book`, redesigned

**Files:**
- Create: `app/(site)/book/step-choose.tsx` (the step-1 UI), `app/(site)/book/date-strip.tsx`
- Modify: `app/(site)/book/booking.tsx` (state: `productKey`, `date`, `start`, `duration`, `people`; drop seat map, auto-select toggle, custom-duration select, `spaces` import), `app/(site)/book/page.tsx` (`?product=` initial value; keep `?space=meeting` → `meeting-4`), `app/(site)/home.css` (new step-1 styles; remove floor-map and seat styles)
- Delete: `app/(site)/book/floor-map.tsx`, `lib/spaces.ts` (move `money` to `lib/format.ts` or `lib/tariff.ts` and update its 3 importers)
- [ ] **Step 1:** Build per the spec: product cards with tariff price → 14-day strip (Today, Tomorrow, then `Mon 27`) + "Pick a date" calendar input → passes: Full Day nothing more / Half Day start chips 08–16; rooms: start chips (past hours today hidden, via `productWindow`) and length chips 1, 2, 3, 4, "More" (5–12) → people stepper for passes (max = free desks from `/api/availability`) → live price panel from `/api/bookings/quote` showing every `QuoteLine` and the GST total; Continue enabled when the quote is valid.
- [ ] **Step 2:** Later steps (Details, Verify, Pay, Done) send the new `holdBody`; summary rows show product, date, time (`timeRange`), people or room, and the quote lines.
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npx eslint "app/(site)/book"`; in dev with Playwright at 1280 and 390 wide: Full Day for 2 tomorrow → total ₹941.64 shown; Boardroom tomorrow 19:00 for 3 h → ₹3,009 with an after-hours line; today after 16:00 Half Day shows no past starts.
- [ ] **Step 4: Commit** `feat(booking): redesign step 1 around the tariff products`.

### Task 11: Site copy and links follow what can be booked

**Files:**
- Modify: `lib/offerings.ts` (`hot-desk`, `dedicated-desk`, `private-cabin` → `cta: "enquire"`; `day-pass` and `meeting-rooms` keep `book` and link `/book?product=day-full` / `/book?product=meeting-4`), `components/site/offering-page.tsx` (book CTA uses the product link), `app/(site)/page.tsx` (hero "Book a Space" stays `/book`)
- [ ] **Step 1:** Implement; `offeringHref` unchanged.
- [ ] **Step 2:** `curl` each `/spaces/*` and `/services/*` page → 200; Hot Desk page has no "Book a Space" button.
- [ ] **Step 3: Commit** `feat(site): point book buttons only at products that can be booked online`.
