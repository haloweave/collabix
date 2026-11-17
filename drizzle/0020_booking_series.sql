ALTER TABLE "booking" ADD COLUMN "series_id" uuid;--> statement-breakpoint
CREATE INDEX "booking_series_idx" ON "booking" USING btree ("series_id");