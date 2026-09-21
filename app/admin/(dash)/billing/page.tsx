import Link from "next/link";
import { requireManager } from "@/lib/admin/auth";
import { listInvoices } from "@/lib/admin/queries";
import { rupees, istDate } from "@/lib/admin/format";
import { paymentsEnabled } from "@/lib/payments";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceActions } from "@/components/admin/invoice-actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  paid: "default",
  sent: "secondary",
  draft: "outline",
  void: "destructive",
};

export default async function BillingPage() {
  await requireManager();
  const invoices = await listInvoices();
  const outstanding = invoices
    .filter((i) => i.status !== "paid" && i.status !== "void")
    .reduce((s, i) => s + i.totalMinor, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          {rupees(outstanding)} outstanding across {invoices.length} invoice
          {invoices.length === 1 ? "" : "s"}.{" "}
          {paymentsEnabled()
            ? "Razorpay is configured."
            : "Manual mode — mark invoices paid by hand."}{" "}
          Generate statements from a member&apos;s profile.
        </p>
      </div>

      {/* Mobile: invoice cards */}
      <div className="space-y-3 md:hidden">
        {invoices.length === 0 && (
          <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No invoices yet.
          </p>
        )}
        {invoices.map((i) => (
          <div key={i.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/members/${i.memberId}`}
                  className="font-medium hover:underline"
                >
                  {i.memberName ?? "—"}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {istDate(i.periodStart)} – {istDate(i.periodEnd)}
                </p>
              </div>
              <Badge
                variant={STATUS_VARIANT[i.status] ?? "outline"}
                className="shrink-0 capitalize"
              >
                {i.status}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
              <span className="font-medium tabular-nums">
                {rupees(i.totalMinor)}
              </span>
              <InvoiceActions id={i.id} status={i.status} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No invoices yet.
                </TableCell>
              </TableRow>
            )}
            {invoices.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link
                    href={`/admin/members/${i.memberId}`}
                    className="font-medium hover:underline"
                  >
                    {i.memberName ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {istDate(i.periodStart)} – {istDate(i.periodEnd)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {rupees(i.totalMinor)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[i.status] ?? "outline"} className="capitalize">
                    {i.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <InvoiceActions id={i.id} status={i.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
