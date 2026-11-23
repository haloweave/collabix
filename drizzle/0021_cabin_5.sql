-- Meeting rooms and cabins are the same thing (client, 2026-11-23): the
-- 4-seater meeting room M-02 becomes Cabin 5 (C-05) in the Cabins zone.
-- Reservations point at the resource id, so existing bookings carry over.
UPDATE "resource"
SET "code" = 'C-05',
    "zone_id" = COALESCE((SELECT "zone_id" FROM "resource" WHERE "code" = 'C-01'), "zone_id")
WHERE "code" = 'M-02';
--> statement-breakpoint
UPDATE "rate_plan" SET "name" = 'Cabin (hourly)' WHERE "key" = 'meeting-4';
