"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  markInvoicePaid,
  voidInvoice,
} from "@/app/admin/(dash)/billing/actions";

export function InvoiceActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status === "paid" || status === "void") return null;

  function run(fn: () => Promise<unknown>, ok: string) {
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

  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => markInvoicePaid(id), "Marked paid.")}
      >
        Mark paid
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => voidInvoice(id), "Voided.")}
      >
        Void
      </Button>
    </div>
  );
}
