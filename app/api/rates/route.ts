import { NextResponse } from "next/server";
import { getActiveRates } from "@/lib/rates";

export const dynamic = "force-dynamic";

// Public: live hourly rates (whole rupees) keyed by plan key. Lazy-loaded by the
// booking page after render so advertised prices track the admin rate plans.
export async function GET() {
  const rates = await getActiveRates();
  return NextResponse.json(rates);
}
