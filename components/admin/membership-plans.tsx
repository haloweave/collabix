"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MembershipPlanRow } from "@/lib/admin/queries";
import {
  createMembershipPlan,
  updateMembershipPlan,
} from "@/app/admin/(dash)/memberships/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function MembershipPlanCreate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("");
  const [overage, setOverage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Enter a plan name.");
      return;
    }
    startTransition(async () => {
      const res = await createMembershipPlan({
        name,
        priceMinor: Math.round(Number(price) * 100),
        includedHours: Math.round(Number(hours)),
        overageRateMinor: Math.round(Number(overage) * 100),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Plan created.");
      setName("");
      setPrice("");
      setHours("");
      setOverage("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Plan name"
        className="w-40"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">₹</span>
        <Input
          type="number"
          placeholder="mo"
          className="w-20"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <Input
        type="number"
        placeholder="incl. hrs"
        className="w-24"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
      />
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">₹</span>
        <Input
          type="number"
          placeholder="overage/hr"
          className="w-24"
          value={overage}
          onChange={(e) => setOverage(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add plan"}
      </Button>
    </form>
  );
}

export function MembershipPlanEditor({ plan }: { plan: MembershipPlanRow }) {
  const router = useRouter();
  const [price, setPrice] = useState(String(Math.round(plan.priceMinor / 100)));
  const [hours, setHours] = useState(String(plan.includedHours));
  const [overage, setOverage] = useState(
    String(Math.round(plan.overageRateMinor / 100)),
  );
  const [active, setActive] = useState(plan.active);
  const [pending, startTransition] = useTransition();

  const dirty =
    Math.round(Number(price) * 100) !== plan.priceMinor ||
    Math.round(Number(hours)) !== plan.includedHours ||
    Math.round(Number(overage) * 100) !== plan.overageRateMinor ||
    active !== plan.active;

  function save() {
    startTransition(async () => {
      try {
        await updateMembershipPlan({
          id: plan.id,
          priceMinor: Math.round(Number(price) * 100),
          includedHours: Math.round(Number(hours)),
          overageRateMinor: Math.round(Number(overage) * 100),
          active,
        });
        toast.success(`${plan.name} updated.`);
        router.refresh();
      } catch {
        toast.error("Could not save the plan.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-[140px] flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{plan.name}</span>
          <Badge variant="outline" className="text-xs">
            {plan.subscribers} member{plan.subscribers === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">₹</span>
        <Input
          type="number"
          className="w-24"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">/mo</span>
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="w-20"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">hrs</span>
      </div>
      <div className="flex items-center gap-1" title="Overage per hour">
        <span className="text-xs text-muted-foreground">+₹</span>
        <Input
          type="number"
          className="w-20"
          value={overage}
          onChange={(e) => setOverage(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">/hr</span>
      </div>
      <Button
        type="button"
        size="sm"
        variant={active ? "secondary" : "outline"}
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
