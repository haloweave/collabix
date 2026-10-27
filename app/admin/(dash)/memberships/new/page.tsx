import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireManager } from "@/lib/admin/auth";
import { Button } from "@/components/ui/button";
import { RecordPassForm } from "@/components/admin/record-pass-form";

export const dynamic = "force-dynamic";

/** Today in Asia/Kolkata as YYYY-MM-DD, for the start date's default/min. */
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default async function NewMembershipPage() {
  await requireManager();
  const today = istToday();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/memberships" aria-label="Back to memberships">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Record a membership</h1>
      </div>
      <RecordPassForm today={today} />
    </div>
  );
}
