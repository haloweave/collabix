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

export const booking = pgTable("booking", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Set once the auth vertical is wired in; inline capture until then.
  memberId: text("member_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  status: bookingStatus("status").notNull().default("active"),
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
  quoteSnapshot: jsonb("quote_snapshot").notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
