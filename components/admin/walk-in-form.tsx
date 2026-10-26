"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BOOKABLE, bookableProduct } from "@/lib/tariff";
import { HALF_DAY_HOURS, MAX_DURATION, PASS_DAY } from "@/lib/domain/booking";
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

const DURATIONS = Array.from({ length: MAX_DURATION }, (_, i) => i + 1);
const ROOM_STARTS = Array.from({ length: 24 }, (_, i) => i);
const HALF_DAY_STARTS = Array.from(
  { length: PASS_DAY.end - HALF_DAY_HOURS - PASS_DAY.start + 1 },
  (_, i) => PASS_DAY.start + i,
);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function WalkInForm({ today }: { today: string }) {
  const router = useRouter();
  const [productKey, setProductKey] = useState<string>(BOOKABLE[0].key);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("9");
  const [duration, setDuration] = useState("2");
  const [people, setPeople] = useState("1");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const product = bookableProduct(productKey)!;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Enter a customer name and email.");
      return;
    }
    startTransition(async () => {
      const res = await createWalkIn({
        productKey,
        date,
        start: Number(start),
        duration: Number(duration),
        people: Number(people),
        customerName: name,
        customerEmail: email,
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
            <span className="text-muted-foreground">Product</span>
            <Select value={productKey} onValueChange={setProductKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOKABLE.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {product.kind === "pass" && (
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">People</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={people}
                onChange={(e) => setPeople(e.target.value)}
              />
            </label>
          )}

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Date</span>
            <Input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          {product.key !== "day-full" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Start</span>
              <Select value={start} onValueChange={setStart}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(product.kind === "room" ? ROOM_STARTS : HALF_DAY_STARTS).map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hh(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {product.kind === "room" && (
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Hours</span>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            )}
          </div>
          )}

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
