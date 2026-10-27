import { z } from "zod";
import { MAX_DURATION } from "../domain/booking";
import { PRODUCT_KEYS, TERM_PLAN_KEYS } from "../tariff";

const productKey = z.enum(PRODUCT_KEYS);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
// Optional window parts: which ones a product needs is checked by productWindow.
const start = z.coerce.number().int().min(0).max(23).optional();
const duration = z.coerce.number().int().min(1).max(MAX_DURATION).optional();

// Per-request people cap for passes — bounds abuse; the 28 desks cap it anyway.
export const MAX_SEATS = 20;
const people = z.coerce.number().int().min(1).max(MAX_SEATS).default(1);

export const availabilityQuery = z.object({ productKey, date, start, duration });

export const quoteBody = z.object({ productKey, date, start, duration, people });

export const holdBody = z.object({
  productKey,
  date,
  start,
  duration,
  people,
  resourceIds: z.array(z.string().uuid()).max(MAX_SEATS).optional(),
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().email().max(254),
  idempotencyKey: z.string().max(200).optional(),
});

// Monthly & annual passes: which counts are valid for the unit is checked by termWindow.
const term = {
  planKey: z.enum(TERM_PLAN_KEYS),
  date,
  unit: z.enum(["month", "year"]),
  count: z.coerce.number().int().min(1).max(12),
};

export const termAvailabilityQuery = z.object(term);

export const termHoldBody = z.object({
  ...term,
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().email().max(254),
});

export const confirmBody = z.object({
  bookingId: z.string().uuid(),
  memberId: z.string().optional(),
});

// Begin an online payment for a held booking. The phone is the OTP-verified
// number (E.164 or 10-digit Indian); Cashfree needs it on the order.
export const payBody = z.object({
  bookingId: z.string().uuid(),
  phone: z.string().trim().regex(/^\+?\d{10,15}$/, "phone must be 10-15 digits"),
});
