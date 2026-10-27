"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { markPaidAtDesk, undoDeskPayment } from "@/app/admin/(dash)/bookings/actions";
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

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

/** "Mark paid" for a booking settled at the front desk. */
export function DeskPaymentButton({ bookingId, amount }: { bookingId: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="mt-1">
          <Banknote className="size-4" />
          Mark paid
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md text-foreground">
        <DialogHeader>
          <DialogTitle>Record a desk payment</DialogTitle>
          <DialogDescription>
            {amount} collected at the front desk. The booking and its invoice will read Paid.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm text-muted-foreground">How did they pay?</legend>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  aria-pressed={method === m.value}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    method === m.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Reference (optional)</span>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "cash" ? "Receipt no." : "UPI / card / bank transaction ID"}
              maxLength={80}
            />
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await markPaidAtDesk({ bookingId, method, reference });
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                setOpen(false);
                toast.success("Payment recorded.");
                router.refresh();
              })
            }
          >
            {pending ? "Saving…" : `Record ${amount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Removes a desk payment entered by mistake. */
export function UndoDeskPayment({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
      onClick={() => {
        if (!window.confirm("Remove this desk payment? The booking goes back to Pay at desk.")) return;
        startTransition(async () => {
          const res = await undoDeskPayment(bookingId);
          if (!res.ok) toast.error("Could not remove the payment.");
          else toast.success("Desk payment removed.");
          router.refresh();
        });
      }}
    >
      {pending ? "Removing…" : "Undo"}
    </button>
  );
}
