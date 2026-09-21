"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CouponRow } from "@/lib/admin/queries";
import { createCoupon, toggleCoupon } from "@/app/staff/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CouponCreate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "flat">("percent");
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !value) {
      toast.error("Enter a code and value.");
      return;
    }
    startTransition(async () => {
      const res = await createCoupon({
        code,
        kind,
        value: kind === "flat" ? Math.round(Number(value) * 100) : Math.round(Number(value)),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Coupon created.");
      setCode("");
      setValue("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="CODE"
        className="w-40 uppercase"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Select value={kind} onValueChange={(v) => setKind(v as "percent" | "flat")}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="percent">% off</SelectItem>
          <SelectItem value="flat">₹ off</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number"
        placeholder={kind === "percent" ? "10" : "200"}
        className="w-24"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add coupon"}
      </Button>
    </form>
  );
}

export function CouponRowActions({ coupon }: { coupon: CouponRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={coupon.active ? "secondary" : "outline"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await toggleCoupon(coupon.id, !coupon.active);
            router.refresh();
          } catch {
            toast.error("Could not update coupon.");
          }
        })
      }
    >
      {coupon.active ? "Active" : "Inactive"}
    </Button>
  );
}

export function CouponBadge({ coupon }: { coupon: CouponRow }) {
  return (
    <Badge variant="outline">
      {coupon.kind === "percent" ? `${coupon.value}% off` : `₹${Math.round(coupon.value / 100)} off`}
    </Badge>
  );
}
