"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { chargeWallet } from "@/app/admin/(dash)/bookings/actions";
import { Button } from "@/components/ui/button";

/** Settle the booking from the member's prepaid wallet. */
export function ChargeWalletButton({
  bookingId,
  memberId,
  balance,
}: {
  bookingId: string;
  memberId: string;
  /** Formatted current balance, e.g. "₹2,000". */
  balance: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="mt-1"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Charge this booking to the member's wallet (${balance} available)?`)) return;
        startTransition(async () => {
          const res = await chargeWallet(bookingId, memberId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Paid from wallet.");
          router.refresh();
        });
      }}
    >
      <Wallet className="size-4" />
      {pending ? "Charging…" : "Charge wallet"}
    </Button>
  );
}
