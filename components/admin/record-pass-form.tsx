"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TERM_PLANS, findTermPlan } from "@/lib/tariff";
import { MAX_MONTHS, MAX_YEARS, addMonths, priceTerm, termMonths } from "@/lib/domain/term";
import { recordPass, type PaidBy } from "@/app/admin/(dash)/memberships/actions";
import { rupees, istDate } from "@/lib/admin/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAID_BY: { key: PaidBy; label: string }[] = [
  { key: "upi", label: "UPI" },
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "bank_transfer", label: "Bank transfer" },
];

// Record a monthly or annual pass sold at the front desk. Same plans and
// prices as the website; the desk or cabin is assigned automatically.
export function RecordPassForm({ today }: { today: string }) {
  const router = useRouter();
  const [planKey, setPlanKey] = useState<string>(TERM_PLANS[0].key);
  const [unit, setUnit] = useState<"month" | "year">("month");
  const [count, setCount] = useState("1");
  const [date, setDate] = useState(today);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paidBy, setPaidBy] = useState<PaidBy>("upi");
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  const plan = findTermPlan(planKey)!;
  const max = unit === "year" ? MAX_YEARS : MAX_MONTHS;
  const n = Math.min(Math.max(1, Number(count) || 1), max);
  const quote = priceTerm(plan, { unit, count: n });
  const endDate = addMonths(date, termMonths({ unit, count: n }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !email.trim()) {
      toast.error("Enter the member's name and email.");
      return;
    }
    startTransition(async () => {
      const res = await recordPass({
        planKey,
        date,
        unit,
        count: n,
        customerName: name.trim(),
        customerEmail: email.trim(),
        phone,
        paidBy,
        reference,
      });
      if (!res.ok) {
        toast.error(res.error);
        if (res.bookingId) router.push(`/admin/bookings/${res.bookingId}`);
        return;
      }
      toast.success("Membership recorded.");
      router.push(`/admin/bookings/${res.bookingId}`);
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Monthly or annual pass</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Plan</span>
            <Select value={planKey} onValueChange={setPlanKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERM_PLANS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Billed</span>
              <Select
                value={unit}
                onValueChange={(v) => {
                  setUnit(v as "month" | "year");
                  setCount("1");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="year">Annually</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">{unit === "year" ? "Years" : "Months"}</span>
              <Input type="number" min={1} max={max} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Starts</span>
            <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Member name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Member email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Mobile (optional)</span>
            <Input type="tel" inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Paid by</span>
            <Select value={paidBy} onValueChange={(v) => setPaidBy(v as PaidBy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAID_BY.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Payment reference (optional)</span>
            <Input placeholder="UPI or bank reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm sm:col-span-2">
            <p className="font-medium">
              {plan.name} · {istDate(`${date}T00:00:00+05:30`)} – {istDate(`${endDate}T00:00:00+05:30`)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {rupees(quote.subtotalMinor)} + GST {rupees(quote.taxMinor)} ={" "}
              <span className="font-medium text-foreground">{rupees(quote.totalMinor)}</span> to collect
            </p>
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Recording…" : "Record paid membership"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
