"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateRatePlan } from "@/app/admin/(dash)/rate-plans/actions";
import type { RatePlanRow } from "@/lib/admin/queries";

export function RatePlanEditor({ plan }: { plan: RatePlanRow }) {
  const router = useRouter();
  const [rupeesPerHour, setRupeesPerHour] = useState(
    String(Math.round(plan.rateMinor / 100)),
  );
  const [active, setActive] = useState(plan.active);
  const [pending, startTransition] = useTransition();

  const dirty =
    Math.round(Number(rupeesPerHour) * 100) !== plan.rateMinor ||
    active !== plan.active;

  function save() {
    const rate = Number(rupeesPerHour);
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error("Enter a valid rate.");
      return;
    }
    startTransition(async () => {
      try {
        await updateRatePlan({
          id: plan.id,
          rateMinor: Math.round(rate * 100),
          active,
        });
        toast.success(`${plan.name} updated.`);
        router.refresh();
      } catch {
        toast.error("Could not save the rate plan.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-[160px] flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{plan.name}</span>
          <Badge variant="outline" className="text-xs capitalize">
            {plan.appliesToKind}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{plan.key}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">₹</span>
        <Input
          type="number"
          min={0}
          className="w-24"
          value={rupeesPerHour}
          onChange={(e) => setRupeesPerHour(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">/hr</span>
      </div>

      <Button
        type="button"
        variant={active ? "secondary" : "outline"}
        size="sm"
        onClick={() => setActive((a) => !a)}
      >
        {active ? "Active" : "Inactive"}
      </Button>

      <Button type="button" size="sm" onClick={save} disabled={!dirty || pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
