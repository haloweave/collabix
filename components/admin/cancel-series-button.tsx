"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelSeriesRemaining } from "@/app/admin/(dash)/bookings/actions";
import { Button } from "@/components/ui/button";

export function CancelSeriesButton({ seriesId, remaining }: { seriesId: string; remaining: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || remaining === 0}
      onClick={() => {
        if (!window.confirm(`Cancel the ${remaining} upcoming date${remaining === 1 ? "" : "s"} in this series?`)) return;
        startTransition(async () => {
          const res = await cancelSeriesRemaining(seriesId);
          toast.success(`${res.cancelled} booking${res.cancelled === 1 ? "" : "s"} cancelled.`);
          router.refresh();
        });
      }}
    >
      {pending ? "Cancelling…" : "Cancel remaining dates"}
    </Button>
  );
}
