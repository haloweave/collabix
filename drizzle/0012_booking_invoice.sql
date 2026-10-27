CREATE TABLE "invoice_counter" (
	"fy" text PRIMARY KEY NOT NULL,
	"last" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "invoice_no" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "invoiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_invoice_no_unique" UNIQUE("invoice_no");--> statement-breakpoint
-- Backfill: number every sale already confirmed (it holds a ticket) in the
-- order it was settled, consecutive within each Indian financial year (Apr–Mar, IST).
WITH settled AS (
	SELECT b.id,
		coalesce((SELECT min(p.paid_at) FROM payment p WHERE p.booking_id = b.id AND p.status = 'paid'), b.created_at) AS at
	FROM booking b
	WHERE b.ticket_token IS NOT NULL
), dated AS (
	SELECT id, at,
		extract(year FROM (at AT TIME ZONE 'Asia/Kolkata'))::int
			- CASE WHEN extract(month FROM (at AT TIME ZONE 'Asia/Kolkata')) < 4 THEN 1 ELSE 0 END AS fy_start
	FROM settled
), numbered AS (
	SELECT id, at,
		lpad((fy_start % 100)::text, 2, '0') || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0') AS fy,
		row_number() OVER (PARTITION BY fy_start ORDER BY at, id) AS seq
	FROM dated
), stamped AS (
	UPDATE booking b
	SET invoice_no = 'CBX/' || n.fy || '/' || lpad(n.seq::text, 4, '0'), invoiced_at = n.at
	FROM numbered n WHERE b.id = n.id
	RETURNING n.fy, n.seq
)
INSERT INTO invoice_counter (fy, last)
SELECT fy, max(seq) FROM stamped GROUP BY fy;
