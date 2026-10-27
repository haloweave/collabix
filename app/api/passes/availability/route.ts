import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getTermAvailability } from "@/lib/domain/reservations";
import { termAvailabilityQuery } from "@/lib/api/validation";

// Public, read-only: how many desks or cabins are free for a whole term.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = termAvailabilityQuery.safeParse({
    planKey: searchParams.get("plan"),
    date: searchParams.get("date"),
    unit: searchParams.get("unit"),
    count: searchParams.get("count"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await getTermAvailability(db, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ window: result.window, free: result.free });
}
