"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScanResultCard } from "@/components/ticket/scan-result-card";
import { useTicketCheck } from "@/components/ticket/use-ticket-check";

// A signed-in staff member opened a ticket link (e.g. via the phone's own
// camera app): treat it as a scan. Runs as a server action after mount, never
// during render, so prefetchers/link scanners can't check anyone in.
export function StaffTicketCheck({ raw }: { raw: string }) {
  const router = useRouter();
  const check = useTicketCheck();
  const started = useRef(false);
  const { submit } = check;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void submit(raw);
  }, [raw, submit]);

  if (check.outcome) {
    return (
      <ScanResultCard outcome={check.outcome} busy={check.busy}
                      onCheckOut={() => void check.checkOut()} onOverride={check.override}
                      onNext={() => router.push("/staff/scan")} nextLabel="Open scanner" />
    );
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-sm text-muted-foreground">
      {check.failed ? (
        <Button variant="outline" onClick={check.retry}><RotateCw className="size-4" /> Retry</Button>
      ) : (
        <><Loader2 className="size-6 animate-spin" /> Verifying ticket…</>
      )}
    </div>
  );
}
