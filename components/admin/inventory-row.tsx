"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  setResourceEnabled,
  setResourceCapacity,
} from "@/app/admin/(dash)/inventory/actions";
import type { InventoryResource } from "@/lib/admin/queries";

export function InventoryRow({ resource }: { resource: InventoryResource }) {
  const router = useRouter();
  const [capacity, setCapacity] = useState(String(resource.capacity));
  const [togglePending, startToggle] = useTransition();
  const [savePending, startSave] = useTransition();

  const capacityDirty = Math.round(Number(capacity)) !== resource.capacity;

  function toggleEnabled() {
    startToggle(async () => {
      try {
        await setResourceEnabled(resource.id, !resource.enabled);
        toast.success(
          `${resource.code} ${resource.enabled ? "taken offline" : "brought online"}.`,
        );
        router.refresh();
      } catch {
        toast.error("Could not update the seat.");
      }
    });
  }

  function saveCapacity() {
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 1) {
      toast.error("Capacity must be at least 1.");
      return;
    }
    startSave(async () => {
      try {
        await setResourceCapacity(resource.id, cap);
        toast.success(`${resource.code} capacity updated.`);
        router.refresh();
      } catch {
        toast.error("Could not save capacity.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <div className="flex min-w-[120px] flex-1 items-center gap-2">
        <span className="font-medium">{resource.code}</span>
        <Badge variant="outline" className="text-xs capitalize">
          {resource.kind}
        </Badge>
        {!resource.enabled && (
          <Badge variant="secondary" className="text-xs">
            Offline
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Seats</span>
        <Input
          type="number"
          min={1}
          className="h-8 w-16"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={saveCapacity}
          disabled={!capacityDirty || savePending}
        >
          {savePending ? "…" : "Save"}
        </Button>
      </div>

      <Button
        type="button"
        size="sm"
        variant={resource.enabled ? "secondary" : "default"}
        onClick={toggleEnabled}
        disabled={togglePending}
      >
        {resource.enabled ? "Take offline" : "Bring online"}
      </Button>
    </div>
  );
}
