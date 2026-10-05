"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type QrScanner from "qr-scanner";
import { Flashlight, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanResultCard } from "@/components/ticket/scan-result-card";
import { useTicketCheck } from "@/components/ticket/use-ticket-check";

const REPEAT_MS = 5000; // ignore the same QR re-read within this window

type CameraState = "starting" | "on" | "denied" | "unavailable" | "insecure";

export function TicketScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [hasFlash, setHasFlash] = useState(false);
  const [code, setCode] = useState("");
  const check = useTicketCheck();
  const submitRef = useRef(check.submit);
  useEffect(() => {
    submitRef.current = check.submit;
  }, [check.submit]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext) return setCamera("insecure");
      const { default: Scanner } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      if (!(await Scanner.hasCamera())) return setCamera("unavailable");
      const scanner = new Scanner(
        videoRef.current,
        (result) => {
          const value = result.data;
          const last = lastRef.current;
          if (last && last.value === value && Date.now() - last.at < REPEAT_MS) return;
          lastRef.current = { value, at: Date.now() };
          scanner.pause();
          void submitRef.current(value);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
      );
      scannerRef.current = scanner;
      try {
        await scanner.start();
        if (cancelled) return;
        setCamera("on");
        setHasFlash(await scanner.hasFlash());
      } catch {
        if (!cancelled) setCamera("denied");
      }
    })();
    return () => {
      cancelled = true;
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  function next() {
    check.reset();
    setCode("");
    // Resume only a camera that was running; a denied/missing one stays off.
    if (camera === "on") scannerRef.current?.start().catch(() => setCamera("denied"));
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    scannerRef.current?.pause();
    void check.submit(code);
  }

  return (
    <>
      <div className="space-y-4">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="size-full object-cover" muted playsInline />
          {camera !== "on" && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">
              {camera === "starting" && (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                  Starting camera — allow access if your browser asks.
                </div>
              )}
              {camera === "denied" && "Camera access was blocked. Allow camera for this site in your browser settings, then reload — or type the ticket code below."}
              {camera === "unavailable" && "No camera found on this device. Type the ticket code below."}
              {camera === "insecure" && "The camera needs a secure (https) connection. Type the ticket code below."}
            </div>
          )}
          {hasFlash && (
            <Button type="button" size="icon" variant="secondary" className="absolute right-3 top-3"
                    aria-label="Toggle torch" onClick={() => void scannerRef.current?.toggleFlash()}>
              <Flashlight className="size-4" />
            </Button>
          )}
        </div>

        <form onSubmit={submitCode} className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ticket code, e.g. CBX-7K4Q"
                 autoCapitalize="characters" autoComplete="off" className="font-mono" aria-label="Ticket code" />
          <Button type="submit" disabled={check.busy || !code.trim()}>Check</Button>
        </form>

        {check.busy && !check.outcome && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Verifying…</p>
        )}
        {check.failed && (
          <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Couldn&apos;t verify — check your connection.
            <Button size="sm" variant="outline" onClick={check.retry}><RotateCw className="size-4" /> Retry</Button>
          </div>
        )}
      </div>

      {/* Portaled to <body>: inside a space-y stack an inherited margin-top
          would offset even a fixed overlay. */}
      {check.outcome &&
        createPortal(
          <div className="admin-scope fixed inset-0 z-50 overflow-y-auto bg-background">
            <ScanResultCard outcome={check.outcome} busy={check.busy}
                            onCheckOut={() => void check.checkOut()} onOverride={check.override} onNext={next} />
          </div>,
          document.body,
        )}
    </>
  );
}
