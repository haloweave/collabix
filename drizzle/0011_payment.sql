CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"member_id" text,
	"provider" text DEFAULT 'cashfree' NOT NULL,
	"order_id" text NOT NULL,
	"cf_order_id" text,
	"payment_session_id" text,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"cf_payment_id" text,
	"payment_method" text,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_booking_id_idx" ON "payment" USING btree ("booking_id");