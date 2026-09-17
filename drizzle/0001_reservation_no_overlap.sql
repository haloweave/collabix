-- Custom SQL migration file, put your code below! --
-- Concurrency-safe double-booking prevention. Drizzle cannot express any of
-- this, so it lives in a hand-written custom migration.
--
-- 1. btree_gist lets a GiST exclusion constraint mix an equality operator (=)
--    on resource_id with an overlap operator (&&) on a range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. A generated half-open [start_at, end_at) range. Half-open so adjacent
--    bookings (08:00-10:00 and 10:00-12:00) do NOT overlap.
ALTER TABLE "reservation"
  ADD COLUMN "period" tstzrange
  GENERATED ALWAYS AS (tstzrange("start_at", "end_at", '[)')) STORED;

-- 3. The guarantee: no two held/confirmed reservations for the same resource
--    may have overlapping periods. Cancelled/expired rows are excluded, so a
--    released hold frees the slot. The constraint cannot reference now(), which
--    is why expired holds are swept to 'expired' by the application before each
--    availability/hold call (see lib/domain/reservations.ts).
ALTER TABLE "reservation"
  ADD CONSTRAINT "reservation_no_overlap"
  EXCLUDE USING gist ("resource_id" WITH =, "period" WITH &&)
  WHERE (status IN ('held', 'confirmed'));