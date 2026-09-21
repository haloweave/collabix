import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff } from "@/lib/admin/auth";
import { getHereToday, getTodayVisitors } from "@/lib/admin/queries";
import { Button } from "@/components/ui/button";
import { ReceptionBoard } from "@/components/admin/reception-board";

export const dynamic = "force-dynamic";

export default async function ReceptionPage() {
  await requireStaff();
  const [here, visitors] = await Promise.all([
    getHereToday(),
    getTodayVisitors(),
  ]);
  const onSite = here.filter((h) => h.checkedIn && !h.checkedOut).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reception</h1>
          <p className="text-sm text-muted-foreground">
            {onSite} on site now · {here.length} booking
            {here.length === 1 ? "" : "s"} today · {visitors.length} visitor
            {visitors.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/bookings/new">
            <Plus className="size-4" />
            New walk-in
          </Link>
        </Button>
      </div>

      <ReceptionBoard here={here} visitors={visitors} />
    </div>
  );
}
