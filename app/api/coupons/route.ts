import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { findActiveCoupon } from "@/lib/domain/reservations";
import { couponQuery } from "@/lib/api/validation";

// Public, read-only: is this discount code active, and what does it take off?
// Lets checkout show the discount before the hold, which checks it again.
export async function GET(req: Request) {
  const parsed = couponQuery.safeParse({ code: new URL(req.url).searchParams.get("code") });
  if (!parsed.success) return NextResponse.json({ error: "invalid_coupon" }, { status: 400 });
  const coupon = await findActiveCoupon(db, parsed.data.code);
  if (!coupon) return NextResponse.json({ error: "invalid_coupon" }, { status: 404 });
  return NextResponse.json(coupon);
}
