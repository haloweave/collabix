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

export const availabilityQuery = z.object({ planKey, date, start, duration });

export const quoteBody = z.object({ planKey, duration });

export const holdBody = z.object({
  planKey,
  resourceId: z.string().uuid(),
  date,
  start,
  duration,
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().email().max(254),
  idempotencyKey: z.string().max(200).optional(),
});

export const confirmBody = z.object({
  reservationId: z.string().uuid(),
  memberId: z.string().optional(),
});
