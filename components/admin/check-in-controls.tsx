"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  checkInBooking,
  checkOutBooking,
} from "@/app/admin/(dash)/reception/actions";

export function CheckInControls({
  bookingId,
  checkedIn,
  checkedOut,
}: {
  bookingId: string;
  checkedIn: boolean;
  checkedOut: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch {
        toast.error("Something went wrong.");
      }
    });
  }

  if (checkedOut) return <Badge variant="outline">Checked out</Badge>;

  if (checkedIn) {
    return (
      <div className="flex items-center gap-2">
        <Badge>Checked in</Badge>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => checkOutBooking(bookingId), "Checked out.")}
        >
          Check out
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => run(() => checkInBooking(bookingId), "Checked in.")}
    >
      Check in
    </Button>
  );
}
