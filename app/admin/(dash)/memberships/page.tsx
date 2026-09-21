import Link from "next/link";
import { requireManager } from "@/lib/admin/auth";
import { listMembershipPlans, listSubscriptions } from "@/lib/admin/queries";
import { rupees, istDate } from "@/lib/admin/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MembershipPlanCreate,
  MembershipPlanEditor,
} from "@/components/admin/membership-plans";

export const dynamic = "force-dynamic";

export default async function MembershipsPage() {
  await requireManager();
  const [plans, subs] = await Promise.all([
    listMembershipPlans(),
    listSubscriptions(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memberships</h1>
        <p className="text-sm text-muted-foreground">
          Monthly plans with an included-hours allowance. Assign a plan to a
          member from their profile.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>Monthly fee and included hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MembershipPlanCreate />
          <div className="divide-y border-t">
            {plans.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                No plans yet. Add one above.
              </p>
            )}
            {plans.map((p) => (
              <MembershipPlanEditor key={p.id} plan={p} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active subscriptions</CardTitle>
          <CardDescription>{subs.length} active.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-center">Usage</TableHead>
                <TableHead>Renews</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No active subscriptions.
                  </TableCell>
                </TableRow>
              )}
              {subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/admin/members/${s.memberId}`}
                      className="font-medium hover:underline"
                    >
                      {s.memberName ?? s.memberEmail ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.planName}
                    <span className="text-muted-foreground">
                      {" "}
                      · {rupees(s.priceMinor)}/mo
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {s.hoursUsed}/{s.includedHours}h
                  </TableCell>
                  <TableCell className="text-sm">{istDate(s.periodEnd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
