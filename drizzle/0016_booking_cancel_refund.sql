ALTER TABLE "booking" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "refund_status" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "refund_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "refund_id" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "refund_reference" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "refunded_at" timestamp with time zone;