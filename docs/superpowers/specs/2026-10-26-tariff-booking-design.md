# Booking on the published tariff — design

Date: 2026-10-26 · Status: draft for approval

## Why

The client's *Membership & Services Tariff 2026* (the PDF, mirrored in
`lib/tariff.ts`) is the only source of truth for what Collabix sells and at
what price. Today the tariff only feeds the `/pricing` page. Everything that
quotes, charges or bills uses other numbers: hourly Hot Desk ₹120, hourly
Cabin ₹600, one Meeting Room ₹900/hr, hourly "Dedicated" ₹200 — none of which
exist in the tariff — and there is no day pass, no 4-seater room, and no
after-hours charge. The client was explicit: implement the tariff exactly,
nothing beyond it, nothing below it.

## Goals

- Every price the app quotes or charges comes from `lib/tariff.ts`, and only
  products listed in the tariff can be booked.
- Online booking sells exactly: Full Day Pass, Half Day Pass, Meeting Room
  (4-seater), The Boardroom, and Corporate Bundles (6/8/10-pack).
- Inventory matches the tariff: 28 shared desks, 4 cabins (4 pax), a 4-seater
  meeting room and an 8-seat boardroom.
- Step 1 of `/book` becomes a low-friction flow: pick product, pick date,
  pick time/length, see the price, continue.

## Non-goals (this project)

- Monthly plans (desks, cabins, virtual office), services and the Weekly Pass
  are not sold online. They stay on `/pricing` with "contact us".
- Staff/admin billing (membership plans, statements, credits, coupons,
  extended bookings) is the **next** project; see "Part 2" at the end.
- SMS/email delivery of OTPs (blocked on the client choosing providers).

## Anti-goals

- Any price, product, discount or rule not in the tariff.
- Early Bird pricing online: the offer has ended (15 Oct 2026) and
  `earlyBirdOpen()` already hides it; if it is re-opened, Early Bird prices
  must apply online too.

## The products (from the tariff, exactly)

| Product | Tariff line | Price (before 18% GST) | Unit | Online |
|---|---|---|---|---|
| Full Day Pass | Single day, per person, all shared-desk access | ₹399 | per person, per day | yes |
| Half Day Pass | 4-hour block | ₹199 | per person, per block | yes |
| Meeting Room (4-seater) | Compact room + TV + whiteboard | ₹350 | per hour | yes |
| The Boardroom | 8 seats, integrated VC, interactive panel | ₹750 | per hour | yes |
| Corporate Bundle 6 / 8 / 10-pack | N accesses, anybody / anytime + N credits | ₹375 | per access (6-pack ₹2,250, 8-pack ₹3,000, 10-pack ₹3,750) | yes (Part B) |
| Weekly Pass | 4 persons, 6 consecutive days, ₹1,499 | — | — | no (client to confirm meaning) |
| All monthly plans, virtual office, services | — | — | — | no (enquiry) |

Rules from the tariff notes, applied in pricing:
- **18% GST** on every price.
- **20% additional for hours between 20:00 and 07:00 IST** — applies to the
  hourly rooms, per hour that falls in that window. A 19:00–22:00 Boardroom
  booking = 1 h × ₹750 + 2 h × ₹900.
- **1 credit = 1 hour** of meeting-room time (used by bundles, Part B).

Decided with the user (2026-10-26):
- Day passes cover **08:00–20:00** and carry **no** night charge.
- Half Day Pass = a 4-hour block **inside 08:00–20:00** (start 08:00–16:00).
  *(builder's call recorded: the tariff says "4-hour block"; keeping it inside
  the day-pass hours matches the no-night-charge decision.)*
- Bundles priced ₹375 **per access**.
- Inventory follows the tariff (28 desks, 4 cabins), not the 44-desk drawing.

## How it works

### Single source of prices
- `lib/tariff.ts` gains a typed **product catalogue** for bookable items
  (key, tariff row name, unit, price, capacity rules), derived from the same
  rows the `/pricing` page renders, so the page and the logic can't drift.
- A pure `priceBooking(product, window, people)` in `lib/domain/booking.ts`
  replaces `computeQuote(rate × hours × seats)`: day passes = price × people;
  rooms = Σ per-hour (rate, ×1.2 for hours in 20:00–07:00); then 18% GST,
  rounded per the existing rule. Fully unit-tested, including the night split.
- The `rate_plan` table stays only as the product registry that reservations
  reference (keys become the product keys); its `rate_minor` is written from
  the tariff and no longer read for pricing. The admin "Rate plans" price
  editor is removed (prices are fixed by the tariff).
- **Non-sellable reservations** *(builder's call)*: admin long-term member
  holds and staff extended bookings keep working until Part 2. They reference
  two internal, unpriced, never-sold registry rows — "Desk (membership)" and
  "Private Cabin (membership)" — chosen by the resource they hold, so a cabin
  hold is never labelled as a meeting room.
- **GST** *(builder's call)*: 18% comes from the tariff, not from
  `settings.taxPercent`; the tax field is removed from admin Settings. The
  settings open/close hours are left alone for now (they only drive
  multi-day ticket windows and the extended-booking estimate, both Part 2).
- `/api/rates` returns tariff prices; the zod enum lists only bookable keys.

### Booking window per product
- Full Day Pass: date only; reservation 08:00–20:00 on that date; desks
  auto-assigned (one per person) from the 28 shared desks.
- Half Day Pass: date + start (08:00–16:00); 4-hour reservation.
- Rooms: date + start (any hour, 24/7) + length (whole hours, 1–12),
  overnight allowed (as shipped today).

### Inventory
- `lib/floorplan.ts`: 28 desks, cabins C-01…C-04, **M-01 = The Boardroom
  (8)**, **M-02 = Meeting Room (4-seater)**. Each room product pins to its
  room by code (replacing today's zone-name mapping).
- Production data migration (not the seed, which truncates): disable the 16
  surplus desks (`enabled = false`, keeps history), add C-03, C-04, M-02,
  relabel M-01, mark the four demo rate plans inactive (kept, so old tickets
  keep their names) and add the tariff products. Production holds only test
  data today (2 test bookings, 1 test member — checked 2026-10-26), so no real
  booking is affected. Run only with the user's go-ahead.
- **Desk layout** *(builder's call)*: the 28 desks are the first 28 by the
  existing banks; C-03, C-04 and M-02 get approximate positions in the freed
  space. The map is staff-only now, and **day-pass tickets show "Any shared
  desk", not a desk code**, so a guest is never sent to a desk number that
  doesn't match the room.
- **Capacity** *(builder's call)*: passes sell while free desks remain among
  the 28, after reservations and member holds — the same rule as today.
  Hot Desk Flexi members have no reservations and are not counted; if the
  space fills, staff add holds. No new cap is invented.

### Step 1 of `/book` (redesign)
1. **What** — four cards: Full Day Pass, Half Day Pass, Meeting Room
   (4-seater), The Boardroom, each with its tariff price.
2. **When** — a horizontal strip of the next 14 days (Today, Tomorrow, Mon 27…)
   plus a calendar for later dates.
3. **Time** — passes: Full Day needs nothing more; Half Day shows start-time
   chips (08:00…16:00). Rooms: start-time chips for the day (past hours
   hidden) and length chips 1 h, 2 h, 3 h, 4 h, "More" (5–12 h).
4. **People** — passes only: a − / + stepper (1 to free desks).
5. **Price** — always visible, live: line items (incl. the night-hours line
   for rooms) and total with GST; Continue is enabled as soon as the choice
   is valid.
- No floor map in the public flow (passes are "any shared desk"; each room
  product is one room).

### Corporate Bundles (Part B — after the above ships)
- Buying online: choose 6/8/10-pack → details → pay. Creates a bundle with a
  code, N accesses and N credits, emailed/shown as a pass.
- Redeeming at the desk: staff scan/enter the code to use 1 access (today,
  08:00–20:00) or N credits (meeting-room hours).
- Needs a small `pass_bundle` table and a staff redeem screen; detailed in its
  own plan before building.

### Staff walk-in
- Uses the same catalogue and `priceBooking`; coupon field removed from the
  walk-in form (coupons are not in the tariff).

## Constraints
- Cashfree charges `quoteSnapshot.totalMinor`; the new quote must keep that
  shape (`subtotalMinor`, `taxMinor`, `totalMinor`, plus line items).
- Integration tests truncate the shared local DB; the user decides when to run
  them.
- Existing bookings keep their stored snapshot; nothing is repriced.

## Part 2 — staff/admin billing on the tariff (next project)
Membership plans become the tariff's monthly plans at fixed prices with their
inclusions (credits, prints, locker, guest passes); statements bill from them;
member meeting-room bookings draw down credits; coupons and hourly "extended"
pricing are removed; annual plans (15% off, 50% deposit waiver) handled per
the tariff. Designed separately.

## Left to the builder
Component structure, styling within the existing brand, the exact date-strip
length, copy wording, test layout.
