import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getAvailability } from "@/lib/domain/reservations";
import { availabilityQuery } from "@/lib/api/validation";

// Public, read-only availability for a plan + window. Limited surface by design.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = availabilityQuery.safeParse({
    planKey: searchParams.get("plan"),
    date: searchParams.get("date"),
    start: searchParams.get("start"),
    duration: searchParams.get("duration"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const resources = await getAvailability(db, parsed.data);
  return NextResponse.json({ resources });
}
