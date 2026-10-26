import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getAvailability } from "@/lib/domain/reservations";
import { availabilityQuery } from "@/lib/api/validation";

// Public, read-only availability for a product + window. Limited surface by design.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = availabilityQuery.safeParse({
    productKey: searchParams.get("product"),
    date: searchParams.get("date"),
    start: searchParams.get("start") ?? undefined,
    duration: searchParams.get("duration") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await getAvailability(db, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ window: result.window, resources: result.resources });
}
