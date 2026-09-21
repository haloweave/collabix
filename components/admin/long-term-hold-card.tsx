"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { HoldRow } from "@/lib/admin/queries";
import { createLongTermHold } from "@/app/admin/(dash)/memberships/actions";
import { cancelBooking } from "@/app/admin/(dash)/bookings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const fmt = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function LongTermHoldCard({
  memberId,
  holds,
}: {
  memberId: string;
  holds: HoldRow[];
}) {
  const router = useRouter();
  const [codes, setCodes] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pending, startTransition] = useTransition();
  const [releasing, startRelease] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!codes.trim() || !start || !end) {
      toast.error("Enter seat/room codes and a date range.");
      return;
    }
    startTransition(async () => {
      const res = await createLongTermHold({
        memberId,
        resourceCodes: codes.split(/[,\s]+/),
        startDate: start,
        endDate: end,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Long-term hold created.");
      setCodes("");
      setStart("");
      setEnd("");
      router.refresh();
    });
  }

  function release(bookingId: string) {
    startRelease(async () => {
      try {
        await cancelBooking(bookingId);
        toast.success("Hold released.");
        router.refresh();
      } catch {
        toast.error("Could not release the hold.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Long-term holds</CardTitle>
        <CardDescription>
          Reserve specific seats or rooms for this member over a date range. Held
          resources show as taken on the public booking page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {holds.length === 0 && (
            <p className="text-sm text-muted-foreground">No active holds.</p>
          )}
          {holds.map((h) => (
            <div
              key={h.bookingId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1">
                  {h.codes.map((c) => (
                    <Badge key={c} variant="secondary" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmt(h.startAt)} – {fmt(new Date(h.endAt.getTime() - 86_400_000))}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={releasing}
                onClick={() => release(h.bookingId)}
              >
                Release
              </Button>
            </div>
          ))}
        </div>

        <form onSubmit={create} className="grid gap-2 border-t pt-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Seat / room codes</span>
            <Input
              placeholder="e.g. D-05, D-06 or M-01"
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">From</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">To</span>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create hold"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
