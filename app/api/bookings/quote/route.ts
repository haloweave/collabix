import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ratePlan } from "@/lib/db/schema";
import { computeQuote } from "@/lib/domain/booking";
import { getSettings } from "@/lib/settings";
import { quoteBody } from "@/lib/api/validation";

// Server-authoritative price. The client never sends money amounts.
export async function POST(req: Request) {
  const parsed = quoteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [plan] = await db
    .select()
    .from(ratePlan)
    .where(eq(ratePlan.key, parsed.data.planKey))
    .limit(1);
  if (!plan) {
    return NextResponse.json({ error: "unknown_plan" }, { status: 404 });
  }
  const settings = await getSettings(db);
  return NextResponse.json({
    quote: computeQuote(
      plan.rateMinor,
      parsed.data.duration,
      parsed.data.seats,
      settings.taxPercent / 100,
    ),
  });
}
