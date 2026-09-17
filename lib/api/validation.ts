import { z } from "zod";
import { ALLOWED_DURATIONS } from "../domain/booking";

const planKey = z.enum(["hotdesk", "dedicated", "cabin", "meeting"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const start = z.coerce.number().int().min(0).max(23);
const duration = z.coerce
  .number()
  .int()
  .refine((d) => (ALLOWED_DURATIONS as readonly number[]).includes(d), {
    message: "duration must be 1, 2, 4 or 8",
  });

// Per-request seat cap — bounds abuse and matches the UI stepper ceiling.
export const MAX_SEATS = 20;
const seats = z.coerce.number().int().min(1).max(MAX_SEATS);

export const availabilityQuery = z.object({ planKey, date, start, duration });

export const quoteBody = z.object({
  planKey,
  duration,
  seats: seats.default(1),
});

export const holdBody = z.object({
  planKey,
  resourceIds: z.array(z.string().uuid()).min(1).max(MAX_SEATS),
  date,
  start,
  duration,
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().email().max(254),
  idempotencyKey: z.string().max(200).optional(),
});

export const confirmBody = z.object({
  bookingId: z.string().uuid(),
  memberId: z.string().optional(),
});
