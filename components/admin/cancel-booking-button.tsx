"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelBooking } from "@/app/admin/(dash)/bookings/actions";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!window.confirm("Cancel this booking and release its seats?")) return;
    startTransition(async () => {
      try {
        await cancelBooking(bookingId);
        toast.success("Booking cancelled.");
        router.refresh();
      } catch {
        toast.error("Could not cancel the booking.");
      }
    });
  }

  return (
    <Button variant="destructive" disabled={pending} onClick={onClick}>
      {pending ? "Cancelling…" : "Cancel booking"}
    </Button>
  );
}
