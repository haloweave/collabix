import Link from "next/link";
import type { MembershipRow, MembershipStatus } from "@/lib/admin/queries";
import { rupees, istDate } from "@/lib/admin/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Monthly and annual passes are the memberships: one row per pass, linking to
// its booking. Shared by /admin/memberships and a member's profile.

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "upcoming") return <Badge variant="secondary">Starts soon</Badge>;
  return <Badge variant="outline">Ended</Badge>;
}

export function termLabel(months: number): string {
  if (months > 0 && months % 12 === 0) return months === 12 ? "1 year" : `${months / 12} years`;
  return months === 1 ? "1 month" : `${months} months`;
}

const DAY_MS = 86_400_000;

/** "12 days left" while active, "starts in 3 days" when upcoming, else the end date. */
function remaining(m: MembershipRow, now: Date): string {
  if (m.status === "active") {
    const days = Math.ceil((m.endAt.getTime() - now.getTime()) / DAY_MS);
    return days === 1 ? "1 day left" : `${days} days left`;
  }
  if (m.status === "upcoming") {
    const days = Math.ceil((m.startAt.getTime() - now.getTime()) / DAY_MS);
    return days === 1 ? "starts tomorrow" : `starts in ${days} days`;
  }
  return `ended ${istDate(m.endAt)}`;
}

export function MembershipTable({
  rows,
  showMember = true,
  empty = "No memberships yet.",
}: {
  rows: MembershipRow[];
  showMember?: boolean;
  empty?: string;
}) {
  const now = new Date();
  return (
    <>
      {/* Mobile: one card per membership */}
      <div className="divide-y border-t md:hidden">
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
        )}
        {rows.map((m) => (
          <Link
            key={m.bookingId}
            href={`/admin/bookings/${m.bookingId}`}
            className="flex items-start justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              {showMember && <p className="truncate font-medium">{m.customerName}</p>}
              <p className={showMember ? "mt-0.5 text-xs text-muted-foreground" : "text-sm font-medium"}>
                {m.planName} · {m.space} · {termLabel(m.months)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {istDate(m.startAt)} – {istDate(m.endAt)} · {remaining(m, now)}
              </p>
            </div>
            <MembershipStatusBadge status={m.status} />
          </Link>
        ))}
      </div>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            {showMember && <TableHead>Member</TableHead>}
            <TableHead>Plan</TableHead>
            <TableHead>Space</TableHead>
            <TableHead>Term</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={showMember ? 7 : 6}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          )}
          {rows.map((m) => (
            <TableRow key={m.bookingId}>
              {showMember && (
                <TableCell>
                  {m.memberId ? (
                    <Link href={`/admin/members/${m.memberId}`} className="font-medium hover:underline">
                      {m.customerName}
                    </Link>
                  ) : (
                    <span className="font-medium">{m.customerName}</span>
                  )}
                  <p className="text-xs text-muted-foreground">{m.customerEmail}</p>
                </TableCell>
              )}
              <TableCell className="text-sm">
                <Link href={`/admin/bookings/${m.bookingId}`} className="hover:underline">
                  {m.planName}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-sm">{m.space}</TableCell>
              <TableCell className="text-sm">{termLabel(m.months)}</TableCell>
              <TableCell className="text-sm">
                {istDate(m.startAt)} – {istDate(m.endAt)}
                <p className="text-xs text-muted-foreground">{remaining(m, now)}</p>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">{rupees(m.totalMinor)}</TableCell>
              <TableCell>
                <MembershipStatusBadge status={m.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
