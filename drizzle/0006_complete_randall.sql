CREATE TABLE "member_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"hours_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"included_hours" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_subscription" ADD CONSTRAINT "member_subscription_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE no action ON UPDATE no action;