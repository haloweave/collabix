import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getMember,
  getMemberSubscription,
  getMemberHolds,
  getMemberInvoices,
  listActivePlans,
} from "@/lib/admin/queries";
import { getSessionUser, isManager } from "@/lib/admin/auth";
import { rupees, istDateTime, istDate } from "@/lib/admin/format";
import { MemberEditor } from "@/components/admin/member-editor";
import { MembershipControls } from "@/components/admin/membership-controls";
import { LongTermHoldCard } from "@/components/admin/long-term-hold-card";
import { GenerateStatementButton } from "@/components/admin/generate-statement-button";
import { InvoiceActions } from "@/components/admin/invoice-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { BookingStatusBadge } from "@/components/admin/booking-status-badge";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) notFound();
  const viewer = await getSessionUser();
  const canManageRoles = isManager(viewer?.role);
  const [subscription, activePlans, holds, invoices] = await Promise.all([
    getMemberSubscription(id),
    listActivePlans(),
    getMemberHolds(id),
    canManageRoles ? getMemberInvoices(id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/members" aria-label="Back to members">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {member.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {member.email} · joined {istDate(member.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={member.role === "member" ? "outline" : "default"}
              className="capitalize"
            >
              {member.role}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Phone
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {member.phoneNumber ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bookings
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {member.bookings.length}
          </CardContent>
        </Card>
      </div>

      <MembershipControls
        memberId={member.id}
        subscription={subscription}
        plans={activePlans}
      />

      <LongTermHoldCard memberId={member.id} holds={holds} />

      {canManageRoles && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Invoices</CardTitle>
            <GenerateStatementButton memberId={member.id} />
          </CardHeader>
          <CardContent className="space-y-2">
            {invoices.length === 0 && (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            )}
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {rupees(inv.totalMinor)}{" "}
                    <span className="font-normal capitalize text-muted-foreground">
                      · {inv.status}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {istDate(inv.periodStart)} – {istDate(inv.periodEnd)}
                  </p>
                </div>
                <InvoiceActions id={inv.id} status={inv.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <MemberEditor
        id={member.id}
        notes={member.notes ?? ""}
        role={member.role}
        canManageRoles={canManageRoles}
      />

      <Card>
        <CardHeader>
          <CardTitle>Booking history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-center">Seats</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {member.bookings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No bookings yet.
                  </TableCell>
                </TableRow>
              )}
              {member.bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-sm">
                    <Link href={`/admin/bookings/${b.id}`} className="block">
                      {b.startAt ? istDateTime(b.startAt) : "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{b.plan ?? "—"}</TableCell>
                  <TableCell className="text-center text-sm">{b.seats}</TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {rupees(b.totalMinor)}
                  </TableCell>
                  <TableCell>
                    <BookingStatusBadge
                      status={b.status}
                      anyConfirmed={b.anyConfirmed}
                      anyActiveHold={b.anyActiveHold}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
