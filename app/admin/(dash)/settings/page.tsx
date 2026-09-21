import { requireManager } from "@/lib/admin/auth";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db/client";
import { SettingsForm } from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireManager();
  const settings = await getSettings(db);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Venue-wide booking rules, tax and closures.
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  );
}
