"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { VenueSettings } from "@/lib/settings";
import { saveSettings } from "@/app/admin/(dash)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SettingsForm({ settings }: { settings: VenueSettings }) {
  const router = useRouter();
  const [taxPercent, setTaxPercent] = useState(String(settings.taxPercent));
  const [openHour, setOpenHour] = useState(String(settings.openHour));
  const [closeHour, setCloseHour] = useState(String(settings.closeHour));
  const [timezone, setTimezone] = useState(settings.timezone);
  const [closed, setClosed] = useState(settings.closedDates.join("\n"));
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveSettings({
        taxPercent: Number(taxPercent),
        openHour: Number(openHour),
        closeHour: Number(closeHour),
        timezone,
        closedDates: closed.split(/[\n,]/).map((d) => d.trim()).filter(Boolean),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Booking rules</CardTitle>
          <CardDescription>
            Applied to new bookings and the price quote. Existing bookings keep
            their frozen totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Tax (%)</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Timezone</span>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Opening hour (0–23)</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={openHour}
              onChange={(e) => setOpenHour(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Closing hour (1–24)</span>
            <Input
              type="number"
              min={1}
              max={24}
              value={closeHour}
              onChange={(e) => setCloseHour(e.target.value)}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closure dates</CardTitle>
          <CardDescription>
            One YYYY-MM-DD per line. Bookings on these dates are rejected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            rows={4}
            value={closed}
            onChange={(e) => setClosed(e.target.value)}
            placeholder="2026-12-25"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </CardContent>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
