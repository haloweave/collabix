"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { addWalletFunds } from "@/app/admin/(dash)/members/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Kind = "topup" | "credit" | "adjust";

const KINDS: { value: Kind; label: string; hint: string; managerOnly?: boolean }[] = [
  { value: "topup", label: "Top-up", hint: "The customer paid you this amount to keep in their wallet." },
  { value: "credit", label: "Free credit", hint: "A goodwill or plan credit. No money changes hands.", managerOnly: true },
  { value: "adjust", label: "Correction", hint: "Fix a mistake. Use a minus sign to take money off.", managerOnly: true },
];

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

const pill = (on: boolean) =>
  cn(
    "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
    on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
  );

export function WalletFundsButton({ memberId, canManage }: { memberId: string; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("topup");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const kinds = KINDS.filter((k) => canManage || !k.managerOnly);

  function submit() {
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees === 0) {
      toast.error("Enter an amount.");
      return;
    }
    startTransition(async () => {
      const res = await addWalletFunds({ memberId, kind, amountRupees: rupees, method, note });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Wallet updated.");
      setOpen(false);
      setAmount("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" />
          Add money
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md text-foreground">
        <DialogHeader>
          <DialogTitle>Update wallet</DialogTitle>
          <DialogDescription>{KINDS.find((k) => k.value === kind)?.hint}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {kinds.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {kinds.map((k) => (
                <button key={k.value} type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)} className={pill(kind === k.value)}>
                  {k.label}
                </button>
              ))}
            </div>
          )}
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Amount (₹)</span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={kind === "adjust" ? "e.g. -200" : "e.g. 2000"}
            />
          </label>
          {kind === "topup" && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm text-muted-foreground">How did they pay?</legend>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <button key={m.value} type="button" aria-pressed={method === m.value} onClick={() => setMethod(m.value)} className={pill(method === m.value)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Note (optional)</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Receipt no., reason…" />
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
