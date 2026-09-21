"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createExtendedBooking } from "@/app/staff/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const rupees = (minor: number) => `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;

function daysInclusive(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const ms = Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd);
  return Math.round(ms / 86_400_000) + 1;
}

export function ExtendedBookingForm({
  today,
  hoursPerDay,
  rateByCode,
}: {
  today: string;
  hoursPerDay: number;
  rateByCode: Record<string, number>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [codes, setCodes] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [total, setTotal] = useState("");
  const [pending, startTransition] = useTransition();

  const codeList = useMemo(
    () => codes.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean),
    [codes],
  );

  // Suggested = Σ(per-code hourly rate) × operating hours/day × days.
  const suggestedMinor = useMemo(() => {
    const days = daysInclusive(start, end);
    const perDay = codeList.reduce((s, c) => s + (rateByCode[c] ?? 0), 0);
    return perDay * hoursPerDay * days;
  }, [codeList, start, end, hoursPerDay, rateByCode]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !codeList.length || !start || !end) {
      toast.error("Fill customer, seat/room codes and a date range.");
      return;
    }
    const totalMinor = total
      ? Math.round(Number(total) * 100)
      : suggestedMinor;
    startTransition(async () => {
      const res = await createExtendedBooking({
        customerName: name,
        customerEmail: email,
        resourceCodes: codeList,
        startDate: start,
        endDate: end,
        totalMinor,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Extended booking created.");
      router.push(`/admin/bookings/${res.bookingId}`);
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Extended booking</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Customer name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Customer email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Seat / room codes</span>
            <Input
              placeholder="e.g. D-05, D-06 or C-01"
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">From</span>
            <Input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">To</span>
            <Input type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>

          <div className="sm:col-span-2 rounded-lg border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Suggested ({codeList.length} resource{codeList.length === 1 ? "" : "s"} ·{" "}
                {daysInclusive(start, end)} day{daysInclusive(start, end) === 1 ? "" : "s"} ·{" "}
                {hoursPerDay}h/day)
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{rupees(suggestedMinor)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTotal(String(Math.round(suggestedMinor / 100)))}
                >
                  Use
                </Button>
              </div>
            </div>
            <label className="mt-3 grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Total to charge (₹) — editable</span>
              <Input
                type="number"
                min={0}
                placeholder={String(Math.round(suggestedMinor / 100))}
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </label>
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create extended booking"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
