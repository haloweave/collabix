import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/jobs/daily";

// Vercel Cron calls this daily (vercel.json) with `Authorization: Bearer
// $CRON_SECRET`. Without CRON_SECRET set, the route refuses everyone, so the
// job can't be triggered by a stranger.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runDailyJobs();
  console.log("[cron:daily]", JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
