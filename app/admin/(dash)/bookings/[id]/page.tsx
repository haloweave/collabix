import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getBooking } from "@/lib/admin/queries";
import { rupees, istDateTime, istDate } from "@/lib/admin/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { CancelBookingButton } from "@/components/admin/cancel-booking-button";
import { DeskPaymentButton, UndoDeskPayment } from "@/components/admin/desk-payment-button";
import { RefundControls } from "@/components/admin/refund-controls";
import { paymentMethodLabel } from "@/lib/invoice/payment-method";
import { owesRefund } from "@/lib/domain/refunds";
import { isManager, requireAdminAccess } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const RES_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  confirmed: "default",
  held: "secondary",
  expired: "outline",
  cancelled: "destructive",
};

// How an online payment reads to staff. refund_due is loud on purpose: Cashfree
// took the money but the seat was lost, so it has to be refunded.
const PAY_LABEL: Record<string, { text: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  paid: { text: "Paid online", variant: "default" },
  created: { text: "Payment started", variant: "secondary" },
  failed: { text: "Payment failed", variant: "outline" },
  expired: { text: "Payment expired", variant: "outline" },
  refund_due: { text: "Refund due", variant: "destructive" },
};

// The refund side of a paid payment once its booking is cancelled.
const REFUND_LABEL: Record<string, { text: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  due: { text: "Refund due", variant: "destructive" },
  failed: { text: "Refund failed", variant: "destructive" },
  pending: { text: "Refund processing", variant: "secondary" },
  refunded: { text: "Refunded", variant: "outline" },
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [staff, booking] = await Promise.all([requireAdminAccess(), getBooking(id)]);
  if (!booking) notFound();

  // Every reservation carries the same booking-wide quote; use the first.
  const quote = booking.reservations[0]?.quote;
  const paidAtDesk = booking.payment?.status === "paid" && booking.payment.provider === "desk";
  // Staff can record a desk payment once the booking is confirmed and nothing
  // has been paid online yet.
  const canMarkPaid =
    booking.status === "active" &&
    booking.payment?.status !== "paid" &&
    booking.reservations.some((r) => r.status === "confirmed") &&
    Boolean(quote?.totalMinor);
  const pay = booking.payment;
  const refundLabel = pay?.refundStatus
    ? REFUND_LABEL[pay.refundStatus]
    : pay?.status === "refund_due"
      ? REFUND_LABEL.due
      : null;
  // A lost-seat payment (status refund_due) shows its refund progress in place.
  const payLabel =
    pay?.status === "refund_due" && pay.refundStatus ? REFUND_LABEL[pay.refundStatus] : pay ? PAY_LABEL[pay.status] : undefined;
  const canRefund = Boolean(pay && owesRefund(pay) && isManager(staff.role));
  const refundAmount = pay ? rupees(pay.refundAmountMinor ?? pay.amountMinor) : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/bookings" aria-label="Back to bookings">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {booking.customerName}
            </h1>
            <p className="break-words text-sm text-muted-foreground">
              {booking.customerEmail} · booked {istDate(booking.createdAt)}
              {booking.invoiceNo && (
                <>
                  {" · invoice "}
                  <span className="font-mono">{booking.invoiceNo}</span>
                </>
              )}
              {booking.ticketToken && (
                <>
                  {" · ticket "}
                  <Link href={`/t/${booking.ticketToken}?view=guest`} target="_blank" className="font-mono underline underline-offset-4">
                    {booking.ticketCode}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {booking.invoiceNo && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/account/invoices/${booking.id}`} download>
                <Download className="size-4" />
                Invoice
              </a>
            </Button>
          )}
          {booking.status === "active" && (
            <CancelBookingButton bookingId={booking.id} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Booking status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {booking.status === "cancelled" ? (
              <Badge variant="destructive">Cancelled</Badge>
            ) : (
              <Badge>Active</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {booking.memberId ? "Linked member" : "Guest checkout"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {quote ? rupees(quote.totalMinor) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {booking.payment ? (
              <>
                <Badge variant={payLabel?.variant ?? "outline"}>
                  {paidAtDesk ? "Paid at desk" : (payLabel?.text ?? booking.payment.status)}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {rupees(booking.payment.amountMinor)}
                  {booking.payment.method ? ` · ${paymentMethodLabel(booking.payment.method)}` : ""}
                  {booking.payment.paidAt ? ` · ${istDateTime(booking.payment.paidAt)}` : ""}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground break-all">
                  {paidAtDesk
                    ? booking.payment.reference
                    : (booking.payment.cfPaymentId ?? booking.payment.orderId)}
                </p>
                {paidAtDesk && !pay?.refundStatus && <UndoDeskPayment bookingId={booking.id} />}
                {refundLabel && pay?.status !== "refund_due" && (
                  <div className="space-y-1 border-t pt-2">
                    <Badge variant={refundLabel.variant}>{refundLabel.text}</Badge>
                    <p className="text-xs text-muted-foreground">
                      {refundAmount}
                      {pay?.refundedAt ? ` · ${istDateTime(pay.refundedAt)}` : ""}
                      {pay?.refundReference ? ` · ${pay.refundReference}` : ""}
                    </p>
                  </div>
                )}
                {pay && canRefund && (
                  <RefundControls
                    bookingId={booking.id}
                    paymentId={pay.id}
                    online={pay.provider === "cashfree"}
                    amount={refundAmount}
                  />
                )}
                {pay && owesRefund(pay) && !isManager(staff.role) && (
                  <p className="text-xs text-muted-foreground">A manager can refund this.</p>
                )}
              </>
            ) : (
              <Badge variant="outline">Pay at desk</Badge>
            )}
            {canMarkPaid && quote && (
              <div>
                <DeskPaymentButton bookingId={booking.id} amount={rupees(quote.totalMinor)} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reservations</CardTitle>
          <CardDescription>
            {booking.reservations.length} seat
            {booking.reservations.length === 1 ? "" : "s"} in this booking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile: reservation cards */}
          <div className="divide-y border-t md:hidden">
            {booking.reservations.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.code}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {r.plan}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {istDateTime(r.startAt)} → {istDateTime(r.endAt)}
                  </p>
                </div>
                <Badge
                  variant={RES_VARIANT[r.status] ?? "outline"}
                  className="shrink-0"
                >
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Seat</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.reservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell className="text-sm">{r.plan}</TableCell>
                  <TableCell className="text-sm">{istDateTime(r.startAt)}</TableCell>
                  <TableCell className="text-sm">{istDateTime(r.endAt)}</TableCell>
                  <TableCell>
                    <Badge variant={RES_VARIANT[r.status] ?? "outline"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {quote && (
        <Card>
          <CardHeader>
            <CardTitle>Price breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {quote.months
                  ? `Subtotal (${quote.months} month${quote.months === 1 ? "" : "s"})`
                  : `Subtotal (${quote.hours}h × ${quote.seats} seat${quote.seats === 1 ? "" : "s"})`}
              </span>
              <span>{rupees(quote.subtotalMinor)}</span>
            </div>
            {quote.discount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coupon {quote.discount.code}</span>
                <span>− {rupees(quote.discount.amountMinor)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{rupees(quote.taxMinor)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Total</span>
              <span>{rupees(quote.totalMinor)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
