# QR e-tickets & scan-to-check-in

Date: 2026-10-05
Status: design approved in chat, spec pending review

## Intent

BookMyShow-style e-tickets for Collabix bookings. Every confirmed booking gets
a ticket with a QR code that carries all the relevant details on screen (who,
plan, seats, date/time, amount). The guest shows it at reception; a staff
member scans it with their phone and the scan both **verifies** the booking
(confirmed, right day, within its time) and **checks the guest in** in one
step.

Success: reception verifies and checks a guest in with one scan in a few
seconds, from a phone, and a forged, guessed or cancelled ticket never passes.

### Payments (out of scope, planned)

Public checkout currently confirms with **no payment** ("Total paid on
arrival"). Booking payments via **Cashfree** come in a separate cycle. This
feature hangs ticket issuance off booking confirmation, not off a payment
provider: once Cashfree lands, its payment-success handler calls
`confirmBooking`, and the ticket is issued then with no change here. Until then
tickets and scan cards show the amount with "Pay at desk"; afterwards they show
"Paid". Changing that label is the only follow-up this feature needs.

## Decisions

- **The QR encodes a link**, `<SITE_URL>/t/<ticket_token>`. The same QR works
  for the guest (opens their ticket page) and for staff (in-app scanner, or the
  phone's normal camera app while signed in as staff).
- **Opaque random token stored on the booking**, not a self-contained signed
  payload: small QR, revocable, and the server always re-checks live state.
- **Backup code** (`CBX-7K4Q`) for typing in when a camera fails.
- **A scan auto-checks in** when the booking is valid now. There is no extra
  confirm tap.
- **Check-in window:** from 30 min before start until the end. Too early on the
  same day can be overridden by staff; other days and ended bookings cannot.
- **Second scan** of a checked-in ticket offers **Check out**.
- Check-in reuses the existing `reservation.checked_in_at / checked_out_at`
  stamps. There is no new attendance table.

## 1. Data & issuance

### Migration `0009` (on `booking`)

| Column | Type | Notes |
|---|---|---|
| `ticket_token` | `text`, unique, nullable | 22-char base64url of 16 random bytes (128-bit). |
| `ticket_code` | `text`, unique, nullable | `CBX-` + 4 chars from a 31-char alphabet with no look-alikes (no `0 O 1 I L`). |

- Nullable because held, unconfirmed bookings have no ticket.
- The migration backfills both columns for every booking with
  `status = 'active'` that has at least one `confirmed` reservation. Tokens come
  from `gen_random_uuid()` bytes; codes come from a PL/pgSQL loop that retries
  on collision. The migration is hand-written SQL, following the
  `0001_reservation_no_overlap.sql` precedent.
- 31⁴ ≈ 923k codes. The code is only a **lookup key typed by staff behind
  auth**, never a bearer credential on a public page, so this keyspace is
  enough. Collisions on insert are retried (up to 5 attempts).

### `lib/domain/ticket.ts` (pure, no DB)

- `newTicketToken(): string`
- `newTicketCode(): string`
- `normalizeTicketInput(raw: string): { token: string } | { code: string } | null`
  accepts a full ticket URL, a bare token, or a code typed in any case, with or
  without the `CBX-` prefix or dash.
- `ticketState(b: TicketBooking, now: Date): TicketState` is the single source
  of truth for both the guest page and the scanner:
  - `phase`: `"not_confirmed" | "cancelled" | "other_day" | "too_early" | "valid_now" | "ended"`
  - `checkedInAt: Date | null` and `checkedOutAt: Date | null`, both counted
    **only if they fall on today (IST)** for multi-day bookings. For same-day
    bookings, today is the booking day anyway.
  - The window is `[start − 30 min, end)` for single-day bookings. Extended
    bookings have `start`/`end` spanning days: they are `valid_now` on any day
    inside their range from 30 min before `settings.openHour` until
    `settings.closeHour` (IST), and `ended` after the last day's close.
  - `phase` is computed purely from time and status; the check-in flags are
    independent of it.
- `TicketBooking` is the minimal shape: status, reservation statuses, start/end,
  check-in/out stamps, `isExtended`, and the open/close hours.

### Issuance: `issueTicket(tx, bookingId)` in `lib/domain/reservations.ts`

- Sets `ticket_token`/`ticket_code` **only where null**, so it is safe to call
  more than once, and returns them.
- Called inside the `confirmBooking` transaction, after the reservations flip
  to `confirmed`. `ConfirmResult` gains `ticketToken` on success, and the
  confirm API returns it.
- Also called in the other confirmed-booking paths: staff walk-ins
  (`app/admin/(dash)/bookings/actions.ts`), extended bookings
  (`app/staff/actions.ts → createExtendedBooking`), and any other insert of
  `status: "confirmed"` found while implementing.
- Cancelling a booking keeps the token. The ticket simply renders and scans as
  **Cancelled**.

## 2. Guest side

### Ticket page `app/t/[token]/page.tsx`

- Public, `robots: noindex`, mobile-first, Collabix brand (navy `#0B1F3A`, gold
  `#C89B53`, ivory `#F7F5F2`, Inter). Lives outside the `(site)` group, with
  its own minimal shell.
- Contents:
  - QR as **server-rendered SVG** (`qrcode` package, error-correction `M`),
    with the backup code below it.
  - Guest name, plan, seat count and resource codes (D-03, D-04), date and IST
    time window (or a date range for extended bookings), and the total with
    "Pay at desk".
  - Status banner from `ticketState`: *Confirmed* / *Checked in at 10:42* /
    *Checked out* / *Booking ended* / *Cancelled*.
  - Address, map link, and an **Add to calendar** `.ics` download served by
    `app/t/[token]/ics/route.ts`.
- Live status: a small client component calls `router.refresh()` every 15 s
  while the page is visible (and stops when hidden), so the guest sees
  "Checked in" appear after reception scans.
- **Staff view:** if the viewer is signed in with a staff role, the page
  renders the staff verify card (section 3) for that booking. This uses the
  same server action, so opening a scanned link from the native camera app
  auto-checks in exactly like the in-app scanner.
- Unknown token → `notFound()`. There is no timing or enumeration signal
  beyond a plain 404.

### Delivery

1. **Booking success screen** (`app/(site)/booking/booking.tsx`, "Done"
   step): shows the QR (fetched as SVG from `/t/<token>/qr.svg`) and a **View
   ticket** button linking to `/t/<token>`.
2. **Confirmation email**, sent after a successful confirm through the existing
   `lib/email.ts → sendEmail`. It carries the details, the QR as a **PNG
   attachment referenced by CID** (Gmail strips inline SVG and data URIs), and
   the ticket link. `sendEmail` gains optional `attachments`. Email failure is
   logged and **never fails the confirm**.
3. **Account → My bookings**: a **Ticket** button on every active booking that
   has a token. `getMyBookings` also returns `ticket_token`.

### QR routes

- `app/t/[token]/qr.svg/route.ts` serves the SVG, so the success screen can
  show it with a plain `<img>` (no QR library in the client bundle).

## 3. Staff scanner

### Pages

- `app/staff/scan/page.tsx` adds **Scan** as the first tab in `StaffNav`. On
  small screens `/staff` also shows a floating **Scan** button.
- `app/admin/(dash)/scan/page.tsx` mounts the same component, with a sidebar
  item (`ScanLine` icon) visible to all staff tiers.
- Both pages are guarded by `requireStaff` (the admin one by `requireAdminAccess`).

### `components/admin/ticket-scanner.tsx` (client)

- Back camera (`facingMode: "environment"`) through the **`qr-scanner`**
  package. It uses the native `BarcodeDetector` where present and a web-worker
  decoder elsewhere, which covers iOS Safari. Viewfinder overlay, plus a torch
  toggle where `hasFlash()` reports support.
- An **Enter code** input sits below the camera at all times.
- If the camera is denied or unavailable, a short explanation of how to allow
  it is shown and the code input stays usable.
- On decode: pause the camera, `navigator.vibrate(80)`, call `scanTicket`,
  show the result card full-screen. **Scan next** resumes. The same decoded
  value is ignored for 5 s.
- Camera requires a **secure context**. Production is HTTPS. For phone testing
  in dev, use an HTTPS tunnel (e.g. `cloudflared tunnel --url localhost:3000`).
  `localhost` works on desktop.

### Server actions (`app/admin/(dash)/reception/actions.ts`)

- `scanTicket(raw: string): Promise<ScanResult>`
  1. `requireStaff()`, then `normalizeTicketInput(raw)`. Unparseable input
     returns `invalid`.
  2. Look up the booking by token or code, together with its reservations,
     resource codes, plan name and total (`lib/admin/queries.ts →
     getTicketBooking`). A miss returns `invalid`.
  3. `ticketState(...)`. If `phase === "valid_now"` and the guest is not
     checked in today, check in (`method: "scan"`, or `"code"` for typed codes).
  4. Return `{ kind, booking details, state, checkedInAt }`.
- `checkInBooking(bookingId, opts?: { method, override })` is extended:
  - For extended bookings, a check-in stamped on an earlier IST day is
    replaced: `checked_in_at = now()` and `checked_out_at = null`.
  - Otherwise the update stays conditional on `checked_in_at IS NULL`, so a
    concurrent double scan writes once and the second caller sees "already
    checked in".
  - `override: true` (the **Check in anyway** button) is only accepted when
    `phase === "too_early"`.
  - Audit: `booking.check_in` with `detail: { method: "scan" | "code" | "manual" | "override" }`.
    The existing reception buttons pass `"manual"`.
- `checkOutBooking` is unchanged, plus `revalidatePath("/staff")`.

### Result cards

| `ScanResult` | Card | Action |
|---|---|---|
| valid_now → just checked in | 🟢 **Verified · Checked in** | — |
| checked in today, not out | 🔵 **Already checked in at HH:MM** | Check out |
| checked out today | ⚪ **Checked out at HH:MM** | — |
| too_early | 🟠 **Too early — starts HH:MM** | Check in anyway |
| other_day | 🟠 **Booked for Sun 12 Oct** | — |
| ended | 🟠 **Ended at HH:MM** | — |
| cancelled / not_confirmed | 🔴 **Cancelled booking** / **Not confirmed** | — |
| invalid | 🔴 **Not a valid Collabix ticket** | — |

Every booking card shows the name, plan, seats and codes, date and time, the
amount with "Pay at desk", and the ticket code. Cards use large type and
colour plus an icon, so they read at arm's length and don't rely on colour
alone.

## 4. Security & errors

- **Token = bearer for viewing only.** Anyone holding the link can see that
  booking's ticket (name, plan, time, amount), the same as a BookMyShow ticket
  link. It never exposes the email, phone, or booking UUID, and it cannot
  change anything.
- **All mutations require a staff session.** `scanTicket` and check-in/out call
  `requireStaff()`. A guest scanning their own QR just sees their ticket.
- **No side effects on GET for non-staff.** The staff auto check-in on `/t/…`
  runs through the server action invoked by the staff card on mount, not in
  the page render, so link prefetchers and email scanners cannot check anyone
  in.
- **Forgery and guessing:** 128-bit random tokens make guessing infeasible.
  Status is always read live from the DB, so a screenshot of a since-cancelled
  ticket fails.
- **`ADMIN_AUTH_DISABLED` dev mode** behaves like the rest of the admin panel
  (dev-admin can scan). Production must not set it, as is already the case.
- Network or action failure in the scanner shows a toast and a **Retry**
  button. It never shows a false green.

## 5. Testing

- **Unit** (`lib/domain/ticket.test.ts`):
  - `ticketState` across every phase boundary (−31/−30 min, start, end − 1 s,
    end), other day, and cancelled.
  - Extended bookings across days, including yesterday's check-in not counting
    today.
  - `normalizeTicketInput` for URL, token, lower-case code, and code without
    the dash.
  - The token/code generators' format and alphabet.
- **Integration** (`tests/tickets.test.ts`, real Postgres, as in
  `tests/reservations.test.ts`):
  - `confirmBooking` issues a token once (idempotent on re-confirm).
  - The migration backfill gives existing confirmed bookings tickets.
  - The scan check-in is conditional: two concurrent check-ins produce one
    stamp.
  - Extended booking re-check-in on a new day.
- **Manual / browser:**
  - Book on the site, then check the success-screen QR, the email (dev mail
    transport), and the `/t/<token>` page.
  - Scan with a real phone over the HTTPS tunnel (iOS Safari and Android
    Chrome) for green, already-in → check-out, too-early → override, and
    cancelled.
  - Type the backup code.
  - Confirm the reception board reflects the scan.
  - Open the ticket URL signed out (guest view) and signed in as reception
    (staff card).
- `npm run lint`, typecheck, `npm run build`.

## Files

New: `drizzle/0009_booking_ticket.sql` (+ meta), `lib/domain/ticket.ts`,
`lib/domain/ticket.test.ts`, `tests/tickets.test.ts`, `app/t/[token]/page.tsx`,
`app/t/[token]/qr.svg/route.ts`, `app/t/[token]/ics/route.ts`,
`components/ticket/*` (ticket view, live refresher, staff card),
`components/admin/ticket-scanner.tsx`, `app/staff/scan/page.tsx`,
`app/admin/(dash)/scan/page.tsx`, `lib/email/booking-ticket.ts`.

Changed: `lib/db/schema.ts`, `lib/domain/reservations.ts`,
`app/api/bookings/confirm/route.ts`, `app/(site)/booking/booking.tsx`,
`app/admin/(dash)/reception/actions.ts`, `app/admin/(dash)/bookings/actions.ts`,
`app/staff/actions.ts`, `lib/admin/queries.ts`, `lib/account/queries.ts`,
`app/account/(portal)/page.tsx`, `lib/email.ts`,
`components/admin/staff-nav.tsx`, `components/admin/app-sidebar.tsx`,
`components/admin/check-in-controls.tsx`, `app/staff/page.tsx`.

Dependencies: `qrcode` (+ `@types/qrcode`), `qr-scanner`.
