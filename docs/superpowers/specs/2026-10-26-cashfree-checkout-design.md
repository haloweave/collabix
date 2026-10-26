# Cashfree online payment at booking checkout — design

**Date:** 2026-10-26 · **Status:** approved (owner opted to skip the question round and asked for the full build)

## Intent

Public bookings are paid online before the seat is theirs, BookMyShow-style.
Today a guest holds seats, verifies an OTP and is confirmed immediately with
"Pay at desk" on the ticket. After this change the guest pays through
Cashfree Payment Gateway between the OTP and the confirmation, and the
booking is confirmed (and the e-ticket issued) only once Cashfree reports the
order as `PAID`.

## Goals

- Every public booking collects the quoted total online before confirmation.
- Confirmation is server-authoritative: the server asks Cashfree for the order
  status; the browser never decides.
- Payment success reaches us two ways and both are safe to run twice: the
  browser returning from checkout, and Cashfree's server-to-server webhook.
- Staff-made bookings (admin walk-in, staff extended stays, membership holds)
  are untouched and still read "Pay at desk" / "Included in membership".
- Local dev without Cashfree keys still works via an explicit dev flag.

## Non-goals / anti-goals

- No refunds API. A payment that lands after the seat was lost is flagged
  `refund_due` and refunded by hand from the Cashfree dashboard.
- No saved cards, subscriptions, or Cashfree customer profiles.
- The Razorpay invoice adapter for admin billing is a separate concern and is
  left as is.
- Never confirm a booking on the strength of a client-side callback alone.

## Constraints (from Cashfree docs / SDK, verified 2026-10-26)

- Server SDK `cashfree-pg@6.0.6`: `new Cashfree(CFEnvironment.SANDBOX|PRODUCTION, appId, secret)`,
  API version `2026-01-01`, base URLs `https://sandbox.cashfree.com/pg` and
  `https://api.cashfree.com/pg`. Methods: `PGCreateOrder`, `PGFetchOrder`,
  `PGOrderFetchPayments`.
- Browser SDK `@cashfreepayments/cashfree-js@1.0.7`: `load({ mode })` then
  `checkout({ paymentSessionId, redirectTarget: "_modal" })`, promise resolves
  with `{ error?, redirect?, paymentDetails? }`. The result is informational only.
- Create order: `order_id` 3–45 chars `[A-Za-z0-9_-]`, `order_amount` in rupees
  with ≤ 2 decimals, min 1; `customer_details.customer_id` 3–50 alnum;
  `customer_phone` 10 digits (leading `+` allowed); `order_meta.return_url`
  gets `{order_id}` substituted and is hit with GET; `order_meta.notify_url`
  must be HTTPS; `order_expiry_time` ISO 8601.
- Order is successful only when `order_status === "PAID"`.
- Webhook headers `x-webhook-signature`, `x-webhook-timestamp`,
  `x-webhook-version`. Signature = base64(HMAC-SHA256(secret, timestamp + rawBody))
  where secret is the API secret key. Verify against the raw body, never a
  re-serialised one. Event `type`: `PAYMENT_SUCCESS_WEBHOOK`,
  `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`; order id at
  `data.order.order_id`.

## Decisions

**Flow.** Steps become Book → Details → Verify → Pay → Done. On the Pay step
the client asks the server to begin payment for the held booking, opens the
Cashfree modal, and when the modal resolves (success, failure, or closed) asks
the server to confirm. The server settles: it fetches the order from Cashfree
and confirms only if `PAID`. If the order is still `ACTIVE` the client retries
confirm a few times (webhook/race), then shows a recoverable message.

**Hold vs payment window.** Beginning a payment extends the booking's hold to
15 minutes from now and sets the Cashfree order to expire at the same moment.
Settling a `PAID` order confirms the booking even if the hold has lapsed (the
guest did pay); the DB exclusion constraint still refuses if someone else now
holds the seat, in which case the payment is marked `refund_due` and the guest
is told the seat was lost.

**Member link.** The confirm route used the session to attach the booking to
the member. The webhook has no session, so the member id is captured on the
payment row when payment begins and passed through on settlement.

**One order per attempt.** A booking may have several payment rows (retry after
a failed attempt). `order_id` = `cbx_<booking uuid without dashes>_<n>`. An
unexpired `created` order is reused rather than re-created.

**Ticket copy.** `ticketAmount` shows `₹X · Paid` when the booking has a
`paid` payment, `₹X · Pay at desk` otherwise, `Included in membership` when
there is no price. Admin booking detail gains a Payment card.

**Dev flag.** `PAYMENTS_DISABLED=true` makes the pay endpoint answer
`{ mode: "disabled" }` and the confirm endpoint skip the payment check. Never
set in production. Without keys and without the flag, the pay endpoint answers
503 `payments_not_configured`.

**Env.** `CASHFREE_ENV` (`sandbox` | `production`), `CASHFREE_APP_ID`,
`CASHFREE_SECRET_KEY`, optional `CASHFREE_WEBHOOK_URL` (defaults to
`<SITE_URL>/api/payments/cashfree/webhook` when SITE_URL is https, else
omitted). Browser mode comes from the pay response, so no public env var.

**Testability.** The gateway is an interface; integration tests inject a fake
that returns scripted order statuses, so settlement, idempotency, lapsed-hold
and seat-lost paths run against the real Postgres without network.

## Left to the builder

Exact copy on the Pay step and error states (tone: the existing booking page),
retry cadence for the pending case, and the shape of the admin Payment card.
