// Booking-engine schema (WARP-inspired resource hierarchy; rate plans kept
// separate from physical resources per docs/coworking-architecture.md).
//
// The `reservation.period` generated column and the btree_gist exclusion
// constraint that actually prevents double-booking are added in a hand-written
// SQL migration (drizzle/0001_reservation_no_overlap.sql) because drizzle-kit
// cannot express EXCLUDE constraints, generated tstzrange columns, or
// CREATE EXTENSION. Better Auth owns its own tables in auth-schema.ts.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const resourceKind = pgEnum("resource_kind", ["desk", "room"]);
export const bookingStatus = pgEnum("booking_status", ["active", "cancelled"]);
export const reservationStatus = pgEnum("reservation_status", [
  "held",
  "confirmed",
  "expired",
  "cancelled",
]);

export const location = pgTable("location", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
});

export const floor = pgTable("floor", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => location.id),
  name: text("name").notNull(),
});

export const zone = pgTable("zone", {
  id: uuid("id").primaryKey().defaultRandom(),
  floorId: uuid("floor_id")
    .notNull()
    .references(() => floor.id),
  name: text("name").notNull(),
  // 'desk_bank' | 'room' — grouping only; a resource carries the bookable kind.
  kind: text("kind").notNull(),
});

export const resource = pgTable("resource", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zone.id),
  code: text("code").notNull().unique(), // e.g. "D-01", "C-01", "M-01"
  kind: resourceKind("kind").notNull(),
  capacity: integer("capacity").notNull().default(1),
  x: integer("x"), // floorplan coordinates (WARP-style), optional
  y: integer("y"),
  enabled: boolean("enabled").notNull().default(true),
});

export const ratePlan = pgTable("rate_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // "hotdesk" | "dedicated" | "cabin" | "meeting"
  name: text("name").notNull(),
  appliesToKind: resourceKind("applies_to_kind").notNull(),
  rateMinor: integer("rate_minor").notNull(), // paise per hour
  currency: text("currency").notNull().default("INR"),
  active: boolean("active").notNull().default(true),
});

// Recurring membership plans: a monthly fee that includes an hours allowance.
// Booking hours draw down the allowance; overage bills at the normal rate.
export const membershipPlan = pgTable("membership_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  priceMinor: integer("price_minor").notNull(), // monthly fee, paise
  includedHours: integer("included_hours").notNull().default(0),
  overageRateMinor: integer("overage_rate_minor").notNull().default(0), // per hour beyond allowance
  currency: text("currency").notNull().default("INR"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A member's active plan. memberId is a user.id (no cross-schema FK, matching
// booking.memberId). hoursUsed accrues within the current period.
export const memberSubscription = pgTable("member_subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: text("member_id").notNull(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => membershipPlan.id),
  status: text("status").notNull().default("active"), // active | cancelled
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  periodStart: timestamp("period_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  hoursUsed: integer("hours_used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Member invoices (monthly statements). Line items are stored as JSON snapshots
// so an invoice never changes when plans/rates later change.
export const invoice = pgTable("invoice", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: text("member_id").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("draft"), // draft | sent | paid | void
  lineItems: jsonb("line_items").notNull(), // [{ label, amountMinor }]
  subtotalMinor: integer("subtotal_minor").notNull(),
  taxMinor: integer("tax_minor").notNull(),
  totalMinor: integer("total_minor").notNull(),
  paymentRef: text("payment_ref"), // gateway id or manual note
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Staff discount codes, applied to a booking total at checkout.
export const coupon = pgTable("coupon", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  kind: text("kind").notNull(), // 'percent' | 'flat'
  value: integer("value").notNull(), // percent (0-100) or flat paise
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Single-row venue settings (id is pinned to 1). Governs tax, bookable hours
// and closure dates used by the booking engine.
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  taxPercent: integer("tax_percent").notNull().default(18),
  openHour: integer("open_hour").notNull().default(8),
  closeHour: integer("close_hour").notNull().default(20),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  closedDates: jsonb("closed_dates").notNull().default([]), // ['YYYY-MM-DD', …]
});

export const booking = pgTable("booking", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Set once the auth vertical is wired in; inline capture until then.
  memberId: text("member_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  status: bookingStatus("status").notNull().default("active"),
  // E-ticket (see lib/domain/ticket.ts): opaque QR token + short backup code,
  // issued when the booking is confirmed. Null while only held.
  ticketToken: text("ticket_token").unique(),
  ticketCode: text("ticket_code").unique(),
  // Tax invoice number (see lib/domain/invoice-number.ts), issued with the
  // ticket on confirmation: CBX/<FY>/<seq>, consecutive within a financial year.
  invoiceNo: text("invoice_no").unique(),
  invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per online payment attempt (see lib/domain/payments.ts). A booking
// may carry several (a retry after a failed attempt is a new order). status:
// created | paid | failed | expired | refund_due — refund_due means Cashfree
// took the money but the seat was lost before we could confirm.
export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => booking.id),
    // Member who started the payment, carried through so a webhook-driven
    // settlement (no session) can still link the booking to them.
    memberId: text("member_id"),
    provider: text("provider").notNull().default("cashfree"),
    orderId: text("order_id").notNull().unique(), // our id, sent to Cashfree
    cfOrderId: text("cf_order_id"),
    paymentSessionId: text("payment_session_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status").notNull().default("created"),
    cfPaymentId: text("cf_payment_id"),
    paymentMethod: text("payment_method"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("payment_booking_id_idx").on(t.bookingId)],
);

// Last invoice serial issued per financial year ('26-27' → 14). Incremented
// inside the confirming transaction, so a rolled-back confirmation leaves no gap.
export const invoiceCounter = pgTable("invoice_counter", {
  fy: text("fy").primaryKey(),
  last: integer("last").notNull(),
});

// A customer's business details, printed as the buyer on their tax invoices
// so they can claim input tax credit. One row per auth user.
export const billingProfile = pgTable("billing_profile", {
  userId: text("user_id").primaryKey(),
  companyName: text("company_name"),
  gstin: text("gstin"),
  address: text("address"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Front-desk visitor / guest sign-in log. Standalone (a visitor need not be a
// member); staff record who they are and who they're here to see.
export const visitor = pgTable("visitor", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  company: text("company"),
  host: text("host"), // member/team they're visiting
  purpose: text("purpose"),
  phone: text("phone"),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
  createdBy: text("created_by"), // actor email
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Append-only trail of staff actions in the admin panel. Not tied to a FK on
// user (actor may be the dev-admin) — we snapshot actor id + email as text.
export const auditEvent = pgTable("audit_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id"),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(), // e.g. "booking.cancel", "rate_plan.update"
  targetType: text("target_type"), // "booking" | "rate_plan" | "resource"
  targetId: text("target_id"),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reservation = pgTable("reservation", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => booking.id),
  resourceId: uuid("resource_id")
    .notNull()
    .references(() => resource.id),
  ratePlanId: uuid("rate_plan_id")
    .notNull()
    .references(() => ratePlan.id),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  // `period` (tstzrange, generated) is added by the hand-written SQL migration.
  status: reservationStatus("status").notNull().default("held"),
  holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
  // Reception attendance stamps (front-desk check-in / check-out).
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
  quoteSnapshot: jsonb("quote_snapshot").notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
