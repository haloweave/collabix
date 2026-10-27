ALTER TABLE "booking" ADD COLUMN "billing_snapshot" jsonb;--> statement-breakpoint
-- Freeze the business details already printed on issued invoices.
UPDATE booking b
SET billing_snapshot = jsonb_build_object('companyName', bp.company_name, 'gstin', bp.gstin, 'address', bp.address)
FROM billing_profile bp
WHERE bp.user_id = b.member_id
	AND b.invoice_no IS NOT NULL
	AND coalesce(bp.company_name, bp.gstin, bp.address) IS NOT NULL;
