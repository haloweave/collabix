import "server-only";
import { sql } from "@/lib/db/client";

// Live hourly rates in whole rupees, keyed by plan key, for public display.
// The booking quote is still computed server-side from rate_plan; this keeps
// the advertised sticker prices in sync with that same source of truth.
export async function getActiveRates(): Promise<Record<string, number>> {
  const rows = await sql`SELECT key, rate_minor FROM rate_plan WHERE active = true`;
  const out: Record<string, number> = {};
  for (const r of rows as Record<string, unknown>[]) {
    out[r.key as string] = Math.round(Number(r.rate_minor) / 100);
  }
  return out;
}
