import { requireMember } from "@/lib/account/auth";
import { getMemberInvoices } from "@/lib/admin/queries";
import { rupees, istDate } from "@/lib/admin/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const STATUS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  paid: "default",
  sent: "secondary",
  draft: "outline",
  void: "destructive",
};

export default async function MyInvoicesPage() {
  const member = await requireMember();
  const invoices = await getMemberInvoices(member.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">Your statements and receipts.</p>
      </div>

      {invoices.length === 0 && (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      )}

      {invoices.map((inv) => (
        <Card key={inv.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">
              {istDate(inv.periodStart)} – {istDate(inv.periodEnd)}
            </CardTitle>
            <Badge variant={STATUS[inv.status] ?? "outline"} className="capitalize">
              {inv.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {inv.lineItems.map((li, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{li.label}</span>
                <span>{rupees(li.amountMinor)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Total</span>
              <span>{rupees(inv.totalMinor)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
