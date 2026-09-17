# Multi-seat booking + consolidated Book step — design

_2026-09-17 · Slice 1 follow-up · branch `feat/booking-platform`_

## Problem

Two gaps in the booking flow:

1. **Two steps that belong together.** "Space" and "Date & seat" are separate
   wizard steps; picking a space then clicking Continue to choose a time is
   friction. They should be one compact "Book" module.
2. **No way to book more than one desk.** A team that wants five desks has to
   book five times. The engine reserves exactly one resource per booking.

This adds multi-desk booking with an auto-assign helper, and merges the first
two steps.

## Decisions (confirmed with user)

- **Seat count applies to open desks only.** Cabins and the Meeting Room stay
  single-select — you book the whole room (it carries its own capacity).
- **Auto-assign keeps the team together.** Pick N available desks clustered in
  one bank where possible; fall back to spreading across banks.
- **Full end-to-end.** hold/confirm reserve N desks under one booking; pricing
  is N × rate × hours; the per-seat double-book guard still holds.

## Architecture

### Pricing — `lib/domain/booking.ts`

`computeQuote(rateMinor, hours, seats = 1)`: `subtotal = rate × hours × seats`;
tax and total derive as before. Default `seats = 1` keeps room bookings and the
quote endpoint unchanged in behaviour.

### Auto-assign — `lib/floorplan.ts`

Desks gain a `bankId` (which `deskBank` they came from). New pure function:

`autoAssignDesks(availableCodes: string[], n: number): string[]`

- Group `availableCodes` by their bank.
- If one bank holds ≥ n available desks, take the first n from it (code order)
  — the team sits together.
- Otherwise take greedily from the banks with the most availability until n are
  chosen (spread), or return as many as exist if fewer than n are free.

Pure and unit-tested; the UI maps returned codes → resourceIds via live slots.

### Reservation engine — `lib/domain/reservations.ts`

- `HoldInput.resourceId: string` → `resourceIds: string[]` (1..N). All desks in
  one call must match the plan kind.
- `holdReservation` creates **one booking and N reservations** in a single
  transaction. Any exclusion-constraint violation (a seat taken concurrently)
  rolls the whole transaction back → `{ ok: false, error: "seat_unavailable" }`
  (all-or-nothing; no partial team booking). Quote is computed with
  `seats = resourceIds.length` and stored on each reservation's snapshot as the
  aggregate booking quote.
- `HoldResult` returns `bookingId`, `reservationIds: string[]`, `holdExpiresAt`,
  `quote` (aggregate). Idempotency key, when given, still short-circuits.
- `confirmReservation(reservationId)` → `confirmBooking({ bookingId, memberId })`:
  lock and confirm every `held` reservation under the booking; if any is expired,
  expire it and return `hold_expired`; attach `memberId` to the booking.

The per-seat exclusion constraint is unchanged — it is what makes concurrent
multi-seat holds safe.

### API — routes + `lib/api/validation.ts`

- `quoteBody` gains `seats` (int ≥ 1, default 1); quote route passes it through.
- `holdBody`: `resourceId` → `resourceIds: z.array(uuid).min(1).max(<cap>)`.
  Response returns `bookingId` + `reservationIds`.
- `confirmBody`: `reservationId` → `bookingId`.
- Availability endpoint is unchanged.

A per-request seat cap (e.g. 20) bounds abuse.

### Booking UI — `app/home/booking/booking.tsx`

Steps: **Book · Details · Verify · Done** (was five).

The "Book" panel holds, top to bottom:
- **Space pills** — the four space types as a compact horizontal selector
  (replaces the standalone Space step's big option list).
- **Date · Start time · Duration** — unchanged controls.
- **Seats control (desk plans only):** a stepper (− N +, min 1, max = number of
  available desks) and an **"Auto-select seats"** toggle, default ON.
- **Floor map** + legend.

Selection state: `selectedResourceIds: string[]` replaces the single id.

- Desk plan, **auto ON:** when slots or seat count change, selection =
  `autoAssignDesks(availableCodes, seatCount)` mapped to resourceIds, shown
  highlighted. If fewer than N desks are free, select what's available and hint.
- **Clicking a seat** sets auto OFF and toggles that seat in the current
  selection (so the auto picks are "taken into consideration"), then it is a
  manual multi-select: clicks add/remove desks; the stepper shows the count.
- **Toggling auto back ON** re-assigns `seatCount` seats.
- **Room plans:** no seats control; single-select one room; auto is irrelevant.

`canContinue` = valid window and `selectedResourceIds.length ≥ 1`. Quote and the
summary scale by seat count (desks) or 1 (room). Hold sends `resourceIds`;
confirm sends the `bookingId` returned by hold.

### Floor map — `app/home/booking/floor-map.tsx`

`selectedResourceId: string | null` → `selectedResourceIds: string[]`.
`renderSeats(slots, selectedResourceIds)` marks a seat `selected` when its
resourceId is in the set. Everything else (glyphs, states, a11y) unchanged.

## Testing

- **Pricing (unit, test-first):** quote scales with seats; `seats = 1` matches
  the old single-seat totals.
- **Auto-assign (unit, test-first):** N from a single bank when it fits; spreads
  when it doesn't; returns fewer when under-supplied; never returns a taken code.
- **Engine (integration, evolve existing + add):**
  - hold N desks → one booking, N `held` reservations, quote × N.
  - one of N taken concurrently → whole hold fails, zero reservations persisted.
  - existing single-seat concurrency / adjacency / expiry / kind-mismatch tests
    keep their intent under the `resourceIds` signature.
  - `confirmBooking` confirms all reservations; expired hold → `hold_expired`.
- `renderSeats` tests updated for the array signature; existing 19 stay green.
- `tsc --noEmit` + lint clean; browser walkthrough of a multi-desk booking end
  to end.

## Out of scope

Per-seat pricing tiers; assigning specific named desks to members; the
room-subtype fix (Meeting Room still bookable under the Cabin plan — tracked
separately); payment gate (next slice).
