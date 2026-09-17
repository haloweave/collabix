# Floor-map seat picker — design

_2026-09-17 · Slice 1 follow-up · branch `feat/booking-platform`_

## Problem

The "Date & seat" step renders live availability as a grid of numbered
circle buttons (`.floor-seats` / `.room-grid`, `app/home/booking/booking.tsx`
and `app/home/home.css:818-839`). It carries no spatial meaning — a user
cannot tell where a desk is, which are by the window, or what the space
actually looks like. Inventory is placeholder (12 desks / 2 cabins / 1 meeting
room) and conflicts with the marketing "120 seats".

We have the real architectural floor plan (`Collabix - R.pdf`, ~13.75 m ×
12.5 m, L-shaped). This work turns the picker into a **BookMyShow-style
interactive floor map**: seat-shaped glyphs placed at their real positions on
a stylized top-down schematic, color-coded by live availability, and backed by
inventory that matches the actual space.

## Decisions (confirmed with user)

- **Fidelity:** stylized schematic — clean, on-brand (navy/gold), real zones
  and seat positions, no CAD clutter. Not a true-to-CAD trace, not a raster.
- **Seat rendering:** actual seat illustrations (desk+chair glyph, room
  outlines), not circles — the BookMyShow model.
- **Inventory:** the floor plan becomes the real source of truth. Re-seed the
  DB to match the plan; resolves the 12-vs-120 conflict with the true count.
- **Build approach:** hand-authored coordinate data (Approach A). One typed
  module is the single source for both the SVG geometry and the DB seed, so
  the map and inventory can never drift apart. (Approach B — PDF vector
  extraction — and C — raster + markers — were rejected.)

## Architecture

### Single source of truth — `lib/floorplan.ts`

The one module that owns the floor's geometry. Pure data + pure derivations,
no React, no DB — importable by both the seed script and the client.

- `FLOOR = { width, height }` — the SVG viewBox, plan millimetres ÷ 10
  (≈ `1375 × 1250`).
- `contextShapes: ContextShape[]` — non-bookable orientation shapes:
  pantry, lounge, stairs, restrooms, CCTV/server room, UPS room, entrance.
  `{ kind, label, x, y, w, h }`. Drawn faint; never interactive.
- `deskBanks: DeskBank[]` — each open-plan bank as an anchor + grid, matching
  the plan's clusters: `{ id, zone, codePrefix, anchor, rows, cols, dx, dy }`.
  Expanded programmatically into desk seats (same style as the current seed's
  formula layout) so counts are one-line adjustable.
- `rooms: Room[]` — cabins and the meeting room as placed outlines:
  `{ code, kind, label, x, y, w, h, capacity }`.
- Derived exports:
  - `seats(): Seat[]` — every bookable resource: `{ code, kind, zone, x, y,
    w, h, rotation? }`. Desks come from expanding `deskBanks`; rooms pass
    through. This is what the seed inserts and what the map renders.
  - `seatByCode: Map<string, Seat>`.

### Inventory — `lib/db/seed.ts`

Re-seed derives resources from `floorplan.seats()` instead of the hardcoded
12/2/1. Zones are created from the distinct `seat.zone` values; each seat
becomes a `resource` row carrying `code`, `kind`, `capacity`, and `x`/`y`
(rounded plan coords — the columns already exist). Rate plans are unchanged.
**No migration** — the schema already has `resource.x` / `resource.y`.

Proposed real inventory read from the plan (best-effort CAD reading, trivially
correctable in one file — see "Open question"):

| Zone / bank            | Type    | Count |
|------------------------|---------|-------|
| Meeting room (top-left)| room    | 1     |
| Private cabins (right) | room    | 2     |
| Open-plan desk banks   | desk    | ~44   |
| **Total bookable**     |         | **~47** |

### Rendering — `app/home/booking/floor-map.tsx`

A client component, `<FloorMap>`, replacing the `.floor-seats` / `.room-grid`
grids.

- Props: `slots: Slot[]` (live availability, `{ resourceId, code, available }`),
  `selectedResourceId`, `onSelect(resourceId)`.
- Renders one `<svg viewBox="0 0 FLOOR.width FLOOR.height">`:
  1. Floor outline + `contextShapes` (faint, labeled, non-interactive).
  2. Every `seats()` glyph. A seat is **interactive** only if its `code`
     appears in `slots` (i.e. it matches the chosen space type); others render
     dim as context. The API already returns only the chosen plan's resources.
  3. Glyphs by type: desk = desk rectangle + chair-back arc; cabin/meeting =
     rounded room outline + table glyph + door notch + label.
- Color states (design tokens): available = gold outline / transparent;
  selected = solid gold fill; unavailable/held = grey (`--line` / muted);
  context = faint navy. A `<title>` per seat gives code + price on hover;
  each interactive seat is a `<button>`-role element (keyboard focusable,
  `aria-pressed`, `aria-label` with code + state) so the picker stays
  accessible — parity with today's buttons.
- A **legend** (available / selected / taken) + an **Entrance** cue sit below
  the map.

### Wiring — `app/home/booking/booking.tsx`

The `label === "Date & seat"` branch swaps the inner `.floor-bank`/`.room-grid`
block for `<FloorMap slots={slots} selectedResourceId={resourceId}
onSelect={...} />`. Selection state, availability fetch, `windowValid`,
`canContinue`, and the summary sidebar are unchanged — the map is a drop-in
presentation of the same `slots`.

### Mobile

The SVG scales to width and can be wider than a phone. On narrow viewports the
map sits in a horizontally-scrollable, pinch-friendly container with a hint,
keeping seat glyphs legible rather than shrinking them to dots. (BookMyShow
does the same.) No separate list fallback — the single accessible SVG with
focusable seats serves both.

### Styling — `app/home/home.css`

Add `.floor-map`, seat/room glyph state classes, legend, and the scroll
container. Remove the now-unused `.floor-seats` circle rules (keep
`.booking-avail`, `.filter-label`, `.avail-hint`). Reuse existing tokens.

## Testing

`lib/floorplan.test.ts` (Vitest, test-first for the data layer):

- Every seat code is unique.
- Every seat lies within `FLOOR` bounds.
- `seat.kind` is consistent with its zone (`room` kinds are rooms, desks are
  desks) and with an existing rate plan's `appliesToKind`.
- Counts match the declared banks (guards accidental layout edits).
- Availability join: given a `slots` list, the derived render state marks the
  right seats interactive/available/unavailable and leaves off-plan seats as
  context; unknown codes don't throw.

The SVG component itself is verified by the existing browser walkthrough (the
render is declarative from tested data). Existing 19 engine tests must stay
green after the re-seed; `tsc --noEmit` and lint clean.

## Out of scope

Admin floor-plan editor, drag-to-place, per-seat pricing tiers, real-time
seat updates via websockets, hot-vs-dedicated spatial split (both remain the
same physical desks, either rate plan — matches the current engine).

## Open question (non-blocking)

Exact desk count is my reading of a CAD raster. The bank definitions in
`lib/floorplan.ts` make the count a one-line edit per bank, so the real
numbers can be dropped in without touching the map or seed logic. Proceeding
with the ~44/2/1 read above as the working inventory.
