import { getResourceRates } from "@/lib/admin/queries";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db/client";
import { ExtendedBookingForm } from "@/components/admin/extended-booking-form";

export const dynamic = "force-dynamic";

export default async function StaffExtendedPage() {
  const [rateByCode, settings] = await Promise.all([
    getResourceRates(),
    getSettings(db),
  ]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const hoursPerDay = Math.max(1, settings.closeHour - settings.openHour);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Extended booking</h1>
        <p className="text-sm text-muted-foreground">
          Reserve a seat or room for a stretch of days. The price is calculated
          automatically — edit it to give a discount or set a fixed deal. The
          resource shows as taken on the public booking page for the whole range.
        </p>
      </div>
      <ExtendedBookingForm
        today={today}
        hoursPerDay={hoursPerDay}
        rateByCode={rateByCode}
      />
    </div>
  );
}
