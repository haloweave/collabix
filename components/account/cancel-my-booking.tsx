"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelOwnBooking } from "@/app/account/actions";
import { Button } from "@/components/ui/button";

export function CancelMyBooking({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Cancel this booking?")) return;
        startTransition(async () => {
          const res = await cancelOwnBooking(bookingId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Booking cancelled.");
          router.refresh();
        });
      }}
    >
      {pending ? "Cancelling…" : "Cancel"}
    </Button>
  );
}
