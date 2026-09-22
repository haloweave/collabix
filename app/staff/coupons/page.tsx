import { Suspense } from "react";
import { listCoupons } from "@/lib/admin/queries";
import { istDate } from "@/lib/admin/format";
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
  CouponCreate,
  CouponRowActions,
  CouponBadge,
} from "@/components/admin/coupon-manager";
import { TableSkeleton } from "@/components/admin/skeletons";

export const dynamic = "force-dynamic";

export default function StaffCouponsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
        <p className="text-sm text-muted-foreground">
          Create discount codes, then apply them by code when booking for a
          customer.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New coupon</CardTitle>
          <CardDescription>A percentage or flat amount off the total.</CardDescription>
        </CardHeader>
        <CardContent>
          <CouponCreate />
        </CardContent>
      </Card>

      <Suspense fallback={<TableSkeleton rows={5} cols={4} />}>
        <CouponsTable />
      </Suspense>
    </div>
  );
}

async function CouponsTable() {
  const coupons = await listCoupons();

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coupons.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                No coupons yet.
              </TableCell>
            </TableRow>
          )}
          {coupons.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono font-medium">{c.code}</TableCell>
              <TableCell>
                <CouponBadge coupon={c} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.expiresAt ? istDate(c.expiresAt) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <CouponRowActions coupon={c} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
