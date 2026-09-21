"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function BookingsFilter({
  defaultQ,
  defaultStatus,
}: {
  defaultQ: string;
  defaultStatus: "all" | "active" | "cancelled";
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaultQ);
  const [status, setStatus] = useState(defaultStatus);

  function apply(next: { q?: string; status?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const ns = next.status ?? status;
    if (nq.trim()) params.set("q", nq.trim());
    if (ns !== "all") params.set("status", ns);
    const qs = params.toString();
    router.push(`/admin/bookings${qs ? `?${qs}` : ""}`);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
    >
      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Select
        value={status}
        onValueChange={(v) => {
          setStatus(v as typeof status);
          apply({ status: v });
        }}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
