import "server-only";
import { db } from "@/lib/db/client";
import { sweepExpiredHolds } from "@/lib/domain/reservations";
import { claimNoShows, claimReminders, claimRenewals } from "@/lib/domain/notifications";
import { syncPendingRefunds } from "@/lib/domain/refunds";
import { getCashfreeGateway } from "@/lib/payments/cashfree";
import { sendNoShowEmail, sendReminderEmail, sendRenewalReminderEmail } from "@/lib/booking-emails";

export type DailySummary = {
  expiredHolds: number;
  reminders: number;
  noShows: number;
  renewals: number;
  refundsSettled: number;
};

/**
 * The once-a-day housekeeping run (Vercel Cron → /api/cron/daily, 18:00 IST):
 * free lapsed holds, remind tomorrow's visitors, flag today's no-shows, nudge
 * passes about to end and settle refunds Cashfree was still processing.
 * Every step is idempotent, so a retry or manual re-run is harmless.
 */
export async function runDailyJobs(now = new Date()): Promise<DailySummary> {
  const expiredHolds = await sweepExpiredHolds(db);

  const reminders = await claimReminders(db, now);
  for (const id of reminders) await sendReminderEmail(id);

  const noShows = await claimNoShows(db, now);
  for (const id of noShows) await sendNoShowEmail(id);

  const renewals = await claimRenewals(db, now);
  for (const id of renewals) await sendRenewalReminderEmail(id);

  const gw = getCashfreeGateway();
  const refundsSettled = gw ? await syncPendingRefunds(db, gw, now) : 0;

  return {
    expiredHolds,
    reminders: reminders.length,
    noShows: noShows.length,
    renewals: renewals.length,
    refundsSettled,
  };
}
