ALTER TABLE "booking" ADD COLUMN "ticket_token" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "ticket_code" text;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_ticket_token_unique" UNIQUE("ticket_token");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_ticket_code_unique" UNIQUE("ticket_code");