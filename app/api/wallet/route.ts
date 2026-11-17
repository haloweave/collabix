import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth";
import { walletBalance } from "@/lib/domain/wallet";

// The signed-in customer's wallet balance, for the checkout's Pay step.
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ balanceMinor: await walletBalance(db, session.user.id) });
}
