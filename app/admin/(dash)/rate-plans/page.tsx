import { Suspense } from "react";
import { requireManager } from "@/lib/admin/auth";
import { listRatePlans } from "@/lib/admin/queries";
import { RatePlanEditor } from "@/components/admin/rate-plan-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default async function RatePlansPage() {
  await requireManager();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rate plans</h1>
        <p className="text-sm text-muted-foreground">
          Set the hourly price for each space type. Changes apply to new
          bookings immediately; existing bookings keep their original price.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Rates are per hour, per seat, before tax.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Suspense fallback={<RatePlansSkeleton />}>
            <RatePlansList />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

function RatePlansSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
      ))}
    </div>
  );
}

async function RatePlansList() {
  const plans = await listRatePlans();

  return (
    <>
      {plans.length === 0 && (
        <p className="py-6 text-sm text-muted-foreground">
          No rate plans found. Run the seed script to create them.
        </p>
      )}
      {plans.map((p, i) => (
        <div key={p.id}>
          {i === 0 && <Separator className="opacity-0" />}
          <RatePlanEditor plan={p} />
        </div>
      ))}
    </>
  );
}
