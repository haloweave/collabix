"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MemberSubscription } from "@/lib/admin/queries";
import {
  assignSubscription,
  cancelSubscription,
} from "@/app/admin/(dash)/memberships/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const rupees = (minor: number) => `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;

export function MembershipControls({
  memberId,
  subscription,
  plans,
}: {
  memberId: string;
  subscription: MemberSubscription | null;
  plans: { id: string; name: string; priceMinor: number; includedHours: number }[];
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function assign() {
    if (!planId) return;
    startTransition(async () => {
      try {
        await assignSubscription(memberId, planId);
        toast.success("Membership assigned.");
        router.refresh();
      } catch {
        toast.error("Could not assign membership.");
      }
    });
  }

  function cancel() {
    if (!subscription) return;
    startTransition(async () => {
      try {
        await cancelSubscription(subscription.id, memberId);
        toast.success("Membership cancelled.");
        router.refresh();
      } catch {
        toast.error("Could not cancel membership.");
      }
    });
  }

  const pct = subscription?.includedHours
    ? Math.min(100, Math.round((subscription.hoursUsed / subscription.includedHours) * 100))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membership</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {subscription ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{subscription.planName}</p>
                <p className="text-xs text-muted-foreground">
                  {rupees(subscription.priceMinor)}/mo · renews{" "}
                  {subscription.periodEnd.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={cancel}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Hours used</span>
                <span>
                  {subscription.hoursUsed} / {subscription.includedHours}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active plans. Create one under Memberships first.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {rupees(p.priceMinor)}/mo · {p.includedHours}h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={assign} disabled={pending || !planId}>
              Assign
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
