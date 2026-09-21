import { WalkInForm } from "@/components/admin/walk-in-form";

export const dynamic = "force-dynamic";

export default function StaffBookPage() {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Book for a customer</h1>
        <p className="text-sm text-muted-foreground">
          Someone called or walked in? Book their seat or room here. Availability
          is checked live; add a coupon for a discount.
        </p>
      </div>
      <WalkInForm today={today} />
    </div>
  );
}
