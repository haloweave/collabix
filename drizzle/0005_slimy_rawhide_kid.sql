CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"tax_percent" integer DEFAULT 18 NOT NULL,
	"open_hour" integer DEFAULT 8 NOT NULL,
	"close_hour" integer DEFAULT 20 NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"closed_dates" jsonb DEFAULT '[]'::jsonb NOT NULL
);
