import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalkInForm } from "@/components/admin/walk-in-form";

export const dynamic = "force-dynamic";

export default function NewBookingPage() {
  // Today in Asia/Kolkata as YYYY-MM-DD, for the date field's default/min.
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/bookings" aria-label="Back to bookings">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New booking</h1>
      </div>
      <WalkInForm today={today} />
    </div>
  );
}
