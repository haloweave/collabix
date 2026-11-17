"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { recordRefund, refundOnlinePayment } from "@/app/admin/(dash)/bookings/actions";
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

/**
 * Refund a cancelled booking's payment. Online payments go back through
 * Cashfree; desk payments are handed back in person and recorded here.
 */
export function RefundControls({
  bookingId,
  paymentId,
  online,
  amount,
}: {
  bookingId: string;
  paymentId: string;
  online: boolean;
  /** Formatted, e.g. "₹826". */
  amount: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = online
        ? await refundOnlinePayment(bookingId, paymentId)
        : await recordRefund(bookingId, paymentId, reference);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success(res.status === "pending" ? "Refund started. Cashfree is processing it." : "Refund recorded.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="mt-1">
          <Undo2 className="size-4" />
          {online ? `Refund ${amount}` : "Record refund"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md text-foreground">
        <DialogHeader>
          <DialogTitle>{online ? "Refund through Cashfree" : "Record a desk refund"}</DialogTitle>
          <DialogDescription>
            {online
              ? `${amount} goes back to the account the customer paid from. This can't be undone.`
              : `Hand ${amount} back to the customer, then record how you did it.`}
          </DialogDescription>
        </DialogHeader>
        {!online && (
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">How it was refunded (optional)</span>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cash, or the UPI / bank transaction ID"
              maxLength={80}
            />
          </label>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Not now
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Refunding…" : online ? `Refund ${amount}` : "Record refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
