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

export const dynamic = "force-dynamic";

export default async function RatePlansPage() {
  await requireManager();
  const plans = await listRatePlans();

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
        </CardContent>
      </Card>
    </div>
  );
}
