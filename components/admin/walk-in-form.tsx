"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BOOKABLE, bookableProduct } from "@/lib/tariff";
import { HALF_DAY_HOURS, MAX_DURATION, PASS_DAY } from "@/lib/domain/booking";
import { createWalkIn } from "@/app/admin/(dash)/bookings/actions";
import { MAX_OCCURRENCES, REPEAT_EVERY, seriesDates, type RepeatEvery } from "@/lib/recurrence";
import { DeskPicker } from "@/components/admin/desk-picker";
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
  const [phone, setPhone] = useState("");
  const [coupon, setCoupon] = useState("");
  const [repeat, setRepeat] = useState<"none" | RepeatEvery>("none");
  const [times, setTimes] = useState("4");
  const [desks, setDesks] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const product = bookableProduct(productKey)!;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || phone.replace(/\D/g, "").length < 10) {
      toast.error("Enter the customer's name, email and mobile number.");
      return;
    }
    const seats = product.kind === "pass" ? desks : [];
    if (seats.length > 0 && seats.length !== Number(people)) {
      toast.error(`Pick ${people} desk${people === "1" ? "" : "s"}, or clear them to use any free desk.`);
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
        phone,
        couponCode: coupon,
        resourceIds: seats.length > 0 ? seats : undefined,
        repeat: repeat === "none" ? undefined : { every: repeat, count: Number(times) },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(repeat === "none" ? "Booking created." : `${times} bookings created.`);
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

          <div className="grid grid-cols-[1fr_auto] gap-3 sm:col-span-2 sm:grid-cols-[1fr_7rem_2fr] sm:items-end">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Repeat</span>
              <Select value={repeat} onValueChange={(v) => setRepeat(v as typeof repeat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Doesn&apos;t repeat</SelectItem>
                  {REPEAT_EVERY.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {repeat !== "none" && (
              <label className="grid gap-1.5 text-sm">
                <span className="text-muted-foreground">Times</span>
                <Input
                  type="number"
                  min={2}
                  max={MAX_OCCURRENCES}
                  value={times}
                  onChange={(e) => setTimes(e.target.value)}
                />
              </label>
            )}
            {repeat !== "none" && Number(times) >= 2 && Number(times) <= MAX_OCCURRENCES && (
              <p className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:pb-2.5">
                Last date {seriesDates(date, repeat, Number(times)).at(-1)}. Each date is its own booking and
                ticket; if any date is taken, nothing is booked.
              </p>
            )}
          </div>

          {product.kind === "pass" && (
            <DeskPicker
              productKey={productKey}
              date={date}
              start={Number(start)}
              repeat={repeat === "none" ? undefined : { every: repeat, count: Number(times) }}
              people={Math.max(1, Number(people) || 1)}
              value={desks}
              onChange={setDesks}
            />
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

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Customer mobile</span>
            <Input
              type="tel"
              inputMode="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Coupon code (optional)</span>
            <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} />
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
