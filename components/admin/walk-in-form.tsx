"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { spaces } from "@/lib/spaces";
import { ALLOWED_DURATIONS, OPEN_HOUR, CLOSE_HOUR } from "@/lib/domain/booking";
import { createWalkIn } from "@/app/admin/(dash)/bookings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const START_HOURS = Array.from(
  { length: CLOSE_HOUR - OPEN_HOUR },
  (_, i) => OPEN_HOUR + i,
);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function WalkInForm({ today }: { today: string }) {
  const router = useRouter();
  const [planKey, setPlanKey] = useState<string>(spaces[0].key);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("9");
  const [duration, setDuration] = useState("2");
  const [seats, setSeats] = useState("1");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [coupon, setCoupon] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Enter a customer name and email.");
      return;
    }
    startTransition(async () => {
      const res = await createWalkIn({
        planKey,
        date,
        start: Number(start),
        duration: Number(duration),
        seats: Number(seats),
        customerName: name,
        customerEmail: email,
        couponCode: coupon,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Booking created.");
      router.push(`/admin/bookings/${res.bookingId}`);
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New walk-in booking</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Space</span>
            <Select value={planKey} onValueChange={setPlanKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spaces.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Seats</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Date</span>
            <Input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Start</span>
              <Select value={start} onValueChange={setStart}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {START_HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hh(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Hours</span>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALLOWED_DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Customer name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Customer email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Coupon code (optional)</span>
            <Input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder="e.g. WELCOME10"
            />
          </label>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create & confirm booking"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
