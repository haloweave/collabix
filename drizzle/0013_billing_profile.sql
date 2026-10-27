CREATE TABLE "billing_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"company_name" text,
	"gstin" text,
	"address" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
