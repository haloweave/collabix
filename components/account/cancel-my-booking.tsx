"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelOwnBooking } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
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

export function CancelMyBooking({
  bookingId,
  summary,
}: {
  bookingId: string;
  /** What is being cancelled, e.g. "Half Day Pass · 3 Dec, 09:00–13:00". */
  summary: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
          Cancel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md text-foreground">
        <DialogHeader>
          <DialogTitle className="text-navy">Cancel this booking?</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Your seat is released straight away and your ticket stops working. For
          questions about a refund, call us on{" "}
          <a href="tel:+919632771444" className="font-medium text-navy underline underline-offset-4">
            +91 96327 71444
          </a>
          .
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Keep booking
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await cancelOwnBooking(bookingId);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                setOpen(false);
                toast.success("Booking cancelled.");
                router.refresh();
              })
            }
          >
            {pending ? "Cancelling…" : "Yes, cancel it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
