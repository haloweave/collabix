# Cashfree Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public bookings are paid online through Cashfree before they are confirmed; confirmation happens only when the server sees the order `PAID`.

**Architecture:** A `payment` row per attempt links a booking to a Cashfree order. `lib/payments/cashfree.ts` wraps the SDK behind a small gateway interface (fakeable). `lib/domain/payments.ts` owns `beginPayment` (create order, extend hold) and `settlePayment` (fetch order, confirm booking, issue ticket; idempotent). Three HTTP entry points call settle: the confirm route, the webhook, and the return page.

**Tech Stack:** Next.js 16 route handlers, Drizzle + Postgres, `cashfree-pg@6.0.6`, `@cashfreepayments/cashfree-js@1.0.7`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-cashfree-checkout-design.md`

## Global Constraints

- Cashfree API version `2026-01-01`; sandbox base `https://sandbox.cashfree.com/pg`.
- `order_id` matches `^[A-Za-z0-9_-]{3,45}$`; `order_amount` is rupees with ≤ 2 decimals, min 1.
- `customer_phone` is 10 digits (or `+` and up to 15 digits); `customer_id` 3–50 alnum.
- `notify_url` only when HTTPS. Webhook signature = base64(HMAC-SHA256(secret, timestamp + rawBody)).
- A booking is confirmed only when `order_status === "PAID"`.
- Pay-at-desk copy stays for staff-made bookings; `PAYMENTS_DISABLED=true` is the only way to confirm without payment.
- Commits: conventional prefix, body explains why, end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Webhook arrives before the browser calls confirm → booking confirmed once, email sent once (Task 3: settle idempotency test).
2. Guest pays after the 10-minute hold lapsed → still confirmed (Task 3: lapsed-hold test).
3. Guest pays but another guest now holds the seat → payment `refund_due`, no confirmation, clear error (Task 3: seat-lost test).
4. Tampered or replayed webhook body → rejected, nothing settled (Task 2: signature test with altered body; Task 5: 400 on bad signature).
5. Cashfree returns `ACTIVE` right after the modal closes → confirm answers `payment_pending`, client retries, no false failure (Task 4 + Task 7).

---

### Task 1: Payment table + schema

**Files:**
- Modify: `lib/db/schema.ts` (after `booking`)
- Create: `drizzle/0011_payment.sql` via `npm run db:generate`

**Interfaces:**
- Produces: `schema.payment` with columns `id uuid pk`, `bookingId uuid → booking.id`, `memberId text|null`, `provider text default 'cashfree'`, `orderId text unique`, `cfOrderId text|null`, `paymentSessionId text|null`, `amountMinor integer`, `currency text default 'INR'`, `status text default 'created'` (`created|paid|failed|expired|refund_due`), `cfPaymentId text|null`, `paymentMethod text|null`, `paidAt timestamptz|null`, `expiresAt timestamptz|null`, `raw jsonb|null`, `createdAt`, `updatedAt`.

- [ ] Add the table to `lib/db/schema.ts` with an index on `booking_id`.
- [ ] Run `npm run db:generate`; rename the generated file to `0011_payment.sql` (update `drizzle/meta/_journal.json` tag to match).
- [ ] Run `set -a && . ./.env && set +a && npm run db:migrate`; expected: migration applies.
- [ ] Commit: `feat(db): add the payment table for online checkout`.

### Task 2: Cashfree gateway wrapper (pure parts tested)

**Files:**
- Create: `lib/payments/cashfree.ts`
- Create: `types/cashfree-js.d.ts` (module declaration for `@cashfreepayments/cashfree-js`: `load({mode}): Promise<{checkout(o:{paymentSessionId:string;redirectTarget?:string}):Promise<{error?:unknown;redirect?:boolean;paymentDetails?:{paymentMessage?:string}}>}|null>`)
- Test: `lib/payments/cashfree.test.ts`

**Interfaces:**
- Produces:
  - `type CashfreeMode = "sandbox" | "production"`
  - `type GatewayOrder = { cfOrderId: string | null; paymentSessionId: string | null; orderStatus: string }`
  - `type GatewayPayment = { cfPaymentId: string | null; status: string; amount: number; method: string | null; raw: unknown }`
  - `interface CashfreeGateway { mode: CashfreeMode; createOrder(i: CreateOrderInput): Promise<GatewayOrder>; fetchOrder(orderId: string): Promise<GatewayOrder>; fetchPayments(orderId: string): Promise<GatewayPayment[]> }`
  - `type CreateOrderInput = { orderId: string; amountRupees: number; customerId: string; customerPhone: string; customerEmail: string; customerName: string; returnUrl: string; notifyUrl?: string; expiresAt: Date; note?: string }`
  - `getCashfreeGateway(): CashfreeGateway | null` (null without `CASHFREE_APP_ID`+`CASHFREE_SECRET_KEY`)
  - `paymentsDisabled(): boolean` (`PAYMENTS_DISABLED === "true"`)
  - `cashfreeMode(): CashfreeMode` (`CASHFREE_ENV === "production"` → production, else sandbox)
  - `verifyWebhookSignature(secret: string, signature: string, timestamp: string, rawBody: string): boolean` (timing-safe)
  - `toOrderAmount(minor: number): number` (rupees, 2 decimals)
  - `newOrderId(bookingId: string, attempt: number): string` → `cbx_<32 hex>_<attempt>`
  - `toCashfreePhone(e164: string): string` (`+91XXXXXXXXXX` → 10 digits; other `+` numbers passed through; already 10 digits unchanged)

- [ ] Write failing tests: signature round-trip true; altered body false; wrong timestamp false; `toOrderAmount(28320) === 283.2`; `newOrderId` matches `^cbx_[0-9a-f]{32}_\d+$` and length ≤ 45; `toCashfreePhone("+919876543210") === "9876543210"`; `toCashfreePhone("9876543210") === "9876543210"`; `toCashfreePhone("+447700900123") === "+447700900123"`.
- [ ] Run `npx vitest run lib/payments`; expected FAIL (module missing).
- [ ] Implement. Real gateway wraps `new Cashfree(CFEnvironment.*, appId, secret)` from `cashfree-pg`; map `PGCreateOrder` → `{ cf_order_id, payment_session_id, order_status }`, `PGFetchOrder`, `PGOrderFetchPayments` (`cf_payment_id, payment_status, payment_amount, payment_group`). Order request: `order_id, order_amount, order_currency:"INR", customer_details{customer_id, customer_phone, customer_email, customer_name}, order_meta{return_url, notify_url?}, order_expiry_time (ISO), order_note`.
- [ ] Run tests; expected PASS. Run `npx tsc --noEmit -p .`; expected clean.
- [ ] Commit: `feat(payments): Cashfree gateway wrapper and webhook signature check`.

### Task 3: Domain: beginPayment / settlePayment (integration tests with a fake gateway)

**Files:**
- Modify: `lib/domain/reservations.ts` — `confirmBooking(db, { bookingId, memberId?, allowLapsedHold? })`
- Create: `lib/domain/payments.ts`
- Create: `tests/helpers/fake-gateway.ts`
- Test: `tests/payments.test.ts`

**Interfaces:**
- Consumes: Task 1 schema, Task 2 types.
- Produces:
  - `confirmBooking` with `allowLapsedHold: true`: lapsed `held` rows and `expired` rows of the booking are set to `confirmed`; an exclusion violation returns `{ ok: false, error: "seat_unavailable" }`.
  - `PAYMENT_WINDOW_MIN = 15`
  - `beginPayment(db, gw, { bookingId, memberId?, phone, email?, name?, returnUrl, notifyUrl?, now? }) → { ok: true, orderId, paymentSessionId, amountMinor, mode } | { ok: false, error: "not_found" | "already_confirmed" | "hold_expired" | "no_amount" }`. Reuses an unexpired `created` payment row; else inserts attempt `n = count+1`; extends `hold_expires_at` of held rows to `now + 15 min`.
  - `settlePayment(db, gw, { orderId, now? }) → { ok: true, status: "paid", bookingId, ticketToken, newlyConfirmed } | { ok: true, status: "pending" | "failed" | "expired" | "refund_due", bookingId } | { ok: false, error: "not_found" }`.
    Paid: in one tx update payment (`status='paid', cfPaymentId, paymentMethod, paidAt, raw`) only if not already paid, then `confirmBooking(tx, { bookingId, memberId: payment.memberId, allowLapsedHold: true })`; on `seat_unavailable` set `refund_due`. `newlyConfirmed` is false on repeat.
  - `settleLatestForBooking(db, gw, bookingId)` → same result, or `{ ok:false, error:"payment_required" }` when no payment row.
  - `markPaymentFailed(db, orderId)` (webhook failure path; only from `created`).
  - `FakeGateway` (tests): `orders: Map<orderId, {status, payments}>`, `createOrder` records and returns `ACTIVE` with `paymentSessionId: "sess_"+orderId`; `setStatus(orderId, "PAID"|"ACTIVE"|"EXPIRED")`.

- [ ] Write failing tests (use `setupSeededDb` + `holdReservation` from `tests/helpers`): begin creates a row with amount = quote total and extends hold; begin twice reuses the order; settle on ACTIVE → pending, booking still held; settle on PAID → paid, confirmed, ticket token present, `newlyConfirmed` true; settle again → `newlyConfirmed` false, one payment row still `paid`; PAID after hold lapsed (set `hold_expires_at` in the past, run `sweepExpiredHolds`) → confirmed; PAID but a second guest holds the seat → `refund_due`, first booking not confirmed; EXPIRED → expired.
- [ ] Run `set -a && . ./.env && set +a && npx vitest run tests/payments.test.ts`; expected FAIL.
- [ ] Implement `allowLapsedHold` in `confirmBooking`, then `lib/domain/payments.ts`.
- [ ] Run the full suite; expected all PASS (existing `reservations`/`tickets`/`checkin`/`scan` unchanged).
- [ ] Commit in two: `feat(booking): let a paid confirmation survive a lapsed hold` then `feat(payments): begin and settle Cashfree orders for a booking`.

### Task 4: Pay + confirm routes

**Files:**
- Modify: `lib/api/validation.ts` — `payBody = { bookingId: uuid, phone: string regex ^\+?\d{10,15}$ }`
- Create: `app/api/bookings/pay/route.ts`
- Modify: `app/api/bookings/confirm/route.ts`

**Interfaces:**
- `POST /api/bookings/pay` → 200 `{ mode: "disabled" }` when `paymentsDisabled()`; 503 `{ error: "payments_not_configured" }` when no gateway; else 200 `{ orderId, paymentSessionId, amountMinor, mode }` or 404/409 with `{ error }`. `memberId` = session user id if any; `returnUrl` = `${siteUrl()}/book/return?order_id={order_id}`; `notifyUrl` = `CASHFREE_WEBHOOK_URL` ?? (`siteUrl()` https ? `${siteUrl()}/api/payments/cashfree/webhook` : undefined). `siteUrl()` moves from `lib/ticket-qr.ts` to `lib/site-url.ts` (export; ticket-qr imports it).
- `POST /api/bookings/confirm` body `{ bookingId }`: if `paymentsDisabled()` → old behaviour. Else `settleLatestForBooking`; `paid` → 200 `{ ok: true, ticketToken }` (+ ticket email after response when `newlyConfirmed`); `pending` → 402 `{ error: "payment_pending" }`; `failed|expired` → 402 `{ error: "payment_failed" }`; `refund_due` → 409 `{ error: "seat_lost" }`; no payment → 402 `{ error: "payment_required" }`.

- [ ] Implement both routes.
- [ ] Verify with curl against `npm run dev` + a real sandbox order: `pay` returns a `paymentSessionId`; `confirm` before paying returns 402 `payment_pending`.
- [ ] Commit: `feat(api): begin a Cashfree payment and confirm only once it is paid`.

### Task 5: Webhook route

**Files:**
- Create: `app/api/payments/cashfree/webhook/route.ts`
- Test: `lib/payments/cashfree.test.ts` already covers the signature; route test is manual.

- [ ] `POST`: `raw = await req.text()`; 503 if no gateway; 400 if `verifyWebhookSignature` false; parse; `PAYMENT_SUCCESS_WEBHOOK` → `settlePayment(orderId = data.order.order_id)` and ticket email when `newlyConfirmed`; `PAYMENT_FAILED_WEBHOOK` → `markPaymentFailed`; others ignored; always 200 after a valid signature. Unknown order ids → 200 (log).
- [ ] Manual check: craft a signed body with a tiny node script using the secret; expect 200; flip one byte → 400.
- [ ] Commit: `feat(payments): Cashfree webhook settles paid orders`.

### Task 6: Return page (redirect fallback)

**Files:**
- Create: `app/(site)/book/return/page.tsx` (`dynamic = "force-dynamic"`)

- [ ] Read `order_id` from search params; settle; `paid` → `redirect("/t/<token>")`; otherwise render a short page: "Payment not completed" with the state in plain words and a link to `/booking`.
- [ ] Commit: `feat(booking): return page for Cashfree redirect checkouts`.

### Task 7: Booking page Pay step

**Files:**
- Modify: `app/(site)/booking/booking.tsx`
- Modify: `app/(site)/home.css` (only if a new class is needed)

- [ ] `STEPS = ["Book","Details","Verify","Pay","Done"]`. `verifyAndConfirm` becomes `verifyOtp`: on OTP success `setStep(3)`.
- [ ] `startPayment()`: POST pay with `{ bookingId, phone: phoneE164 }`; `mode === "disabled"` → `settle()`; else `const cf = await (await import("@cashfreepayments/cashfree-js")).load({ mode }); await cf.checkout({ paymentSessionId, redirectTarget: "_modal" });` then `settle()`.
- [ ] `settle(attempt = 0)`: POST confirm; ok → Done (ticket token); `payment_pending` and attempt < 5 → wait 2 s and retry; `payment_pending` after retries → error "We're still waiting for the bank. If money was debited you'll get your ticket by email within a few minutes." with the Pay button re-enabled; `payment_failed` → "Payment didn't go through. Nothing was charged — try again."; `seat_lost` → "That seat was taken while you paid. We'll refund you in full."; `hold_expired` → existing copy.
- [ ] Pay step UI: hold timer, amount line `Pay ₹X securely`, button, "Secure payment by Cashfree · UPI, cards, net banking". Done step: `Total paid: ₹X`. Summary note: "Availability and totals are live. Pay securely online to confirm."
- [ ] Browser check through the dev server: full flow with Cashfree sandbox test UPI/card succeeds and lands on Done with a QR.
- [ ] Commit: `feat(booking): pay online through Cashfree before confirmation`.

### Task 8: Paid state on tickets, admin and account

**Files:**
- Modify: `lib/domain/ticket-view.ts` (+ `paid: boolean` via `EXISTS (SELECT 1 FROM payment p WHERE p.booking_id=b.id AND p.status='paid')`)
- Modify: `lib/domain/ticket-display.ts` — `ticketAmount(v: { totalMinor: number|null; paid?: boolean })`; `PAYMENT_NOTE` → `PAY_AT_DESK = "Pay at desk"`, `PAID = "Paid"`.
- Modify: `lib/domain/ticket.test.ts` (paid + unpaid cases), `components/ticket/scan-result-card.tsx`, `lib/ticket-email.ts` (compile only)
- Modify: `lib/admin/queries.ts` `getBooking` (+ `payment: { status, orderId, cfPaymentId, method, amountMinor, paidAt } | null`), `app/admin/(dash)/bookings/[id]/page.tsx` (Payment card)
- Modify: `lib/account/queries.ts` (+ `paid`), `app/account/(portal)/page.tsx` ("Paid" / "Pay at desk" tag)

- [ ] Update the unit test first, run, implement, run.
- [ ] Commit in two: `feat(tickets): show Paid on tickets settled online` then `feat(admin): show the payment on the booking detail and account pages`.

### Task 9: Env docs

**Files:**
- Modify: `.env.example` (Cashfree block + `PAYMENTS_DISABLED`), `README.md` (one paragraph under payments if a section exists).

- [ ] Commit: `docs: document Cashfree env vars and the dev payments bypass`.

### Task 10: Verify and finish

- [ ] Full suite with DB env: all green. `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.
- [ ] Use superpowers:finishing-a-development-branch.
