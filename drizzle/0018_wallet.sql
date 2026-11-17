CREATE TABLE "wallet_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"kind" text NOT NULL,
	"booking_id" uuid,
	"method" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_entry" ADD CONSTRAINT "wallet_entry_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_entry_user_idx" ON "wallet_entry" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entry_booking_kind_uq" ON "wallet_entry" USING btree ("booking_id","kind");