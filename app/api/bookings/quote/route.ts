import { NextResponse } from "next/server";
import { priceBooking, productWindow } from "@/lib/domain/booking";
import { bookableProduct } from "@/lib/tariff";
import { quoteBody } from "@/lib/api/validation";

// Server-authoritative price from the tariff. The client never sends money amounts.
export async function POST(req: Request) {
  const parsed = quoteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const product = bookableProduct(parsed.data.productKey)!;
  const now = new Date();
  const w = productWindow(product, parsed.data, now);
  if (!w.ok) return NextResponse.json({ error: w.error }, { status: 400 });
  return NextResponse.json({ quote: priceBooking(product, w.window, parsed.data.people, now) });
}
