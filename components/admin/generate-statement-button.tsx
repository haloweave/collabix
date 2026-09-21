"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateStatement } from "@/app/admin/(dash)/billing/actions";

export function GenerateStatementButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await generateStatement(memberId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Statement generated.");
          router.refresh();
        })
      }
    >
      {pending ? "Generating…" : "Generate statement"}
    </Button>
  );
}
