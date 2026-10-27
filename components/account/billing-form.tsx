"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateBillingProfile } from "@/app/account/actions";
import type { BillingDetails } from "@/lib/account/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BillingForm({ initial }: { initial: BillingDetails }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty =
    form.companyName !== initial.companyName ||
    form.gstin !== initial.gstin ||
    form.address !== initial.address;
  const set = (k: keyof BillingDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateBillingProfile(form);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Billing details saved. They will appear on your invoices.");
          router.refresh();
        });
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">Business name</span>
        <Input value={form.companyName} onChange={set("companyName")} placeholder="Acme Studio LLP" autoComplete="organization" />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">GSTIN</span>
        <Input
          value={form.gstin}
          onChange={set("gstin")}
          placeholder="29ABCDE1234F1Z5"
          maxLength={20}
          className="font-mono uppercase"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        <span className="text-muted-foreground">Billing address</span>
        <textarea
          value={form.address}
          onChange={set("address")}
          rows={2}
          placeholder="Registered address, as on your GST certificate"
          autoComplete="street-address"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save billing details"}
        </Button>
        <span className="text-xs text-muted-foreground">Optional. Printed on invoices for bookings confirmed after you save; earlier invoices stay as issued.</span>
      </div>
    </form>
  );
}
