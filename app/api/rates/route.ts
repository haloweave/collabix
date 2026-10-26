import { NextResponse } from "next/server";
import { BOOKABLE, productPriceMinor } from "@/lib/tariff";

export const dynamic = "force-dynamic";

// Public: the tariff price (whole rupees) of each bookable product, keyed by
// product key. Dynamic so an Early Bird window takes effect without a deploy.
export async function GET() {
  const now = new Date();
  return NextResponse.json(
    Object.fromEntries(BOOKABLE.map((p) => [p.key, Math.round(productPriceMinor(p, now) / 100)])),
  );
}
