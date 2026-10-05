"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { checkOutBooking, scanTicket } from "@/app/admin/(dash)/reception/actions";
import type { ScanOutcome } from "@/lib/domain/scan";

// Shared state for the camera scanner and the staff view of /t/<token>:
// submit a scanned value, show the outcome, and follow up (override/check out).
export function useTicketCheck() {
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const rawRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const submit = useCallback(async (raw: string, opts?: { override?: boolean }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    rawRef.current = raw;
    setBusy(true);
    setFailed(false);
    try {
      const res = await scanTicket(raw, opts);
      setOutcome(res);
      navigator.vibrate?.(res.kind === "ticket" && res.justCheckedIn ? 80 : [60, 60, 60]);
    } catch {
      // Never show a stale or optimistic green — surface the failure instead.
      setOutcome(null);
      setFailed(true);
      toast.error("Couldn't reach the server — try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (rawRef.current) void submit(rawRef.current);
  }, [submit]);

  const override = useCallback(() => {
    if (rawRef.current) void submit(rawRef.current, { override: true });
  }, [submit]);

  const checkOut = useCallback(async () => {
    if (outcome?.kind !== "ticket" || !rawRef.current) return;
    setBusy(true);
    try {
      await checkOutBooking(outcome.view.bookingId);
      toast.success("Checked out.");
    } catch {
      toast.error("Check-out failed — try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await submit(rawRef.current); // refresh the card from live state
  }, [outcome, submit]);

  const reset = useCallback(() => {
    setOutcome(null);
    setFailed(false);
  }, []);

  return { outcome, busy, failed, submit, retry, override, checkOut, reset };
}
