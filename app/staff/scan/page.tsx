import type { Metadata } from "next";
import { TicketScanner } from "@/components/admin/ticket-scanner";

export const metadata: Metadata = { title: "Scan ticket · Collabix Staff" };

export default function StaffScanPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scan ticket</h1>
        <p className="text-sm text-muted-foreground">Point at the guest&apos;s QR code — a valid ticket checks them in.</p>
      </div>
      <TicketScanner />
    </div>
  );
}
