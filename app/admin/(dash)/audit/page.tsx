import { Suspense } from "react";
import Link from "next/link";
import { requireManager } from "@/lib/admin/auth";
import { listAuditEvents } from "@/lib/admin/queries";
import { istDateTime } from "@/lib/admin/format";
import { TableSkeleton, TextSkeleton } from "@/components/admin/skeletons";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function targetHref(type: string | null, id: string | null) {
  if (!id) return null;
  if (type === "booking") return `/admin/bookings/${id}`;
  return null;
}

export default async function AuditPage() {
  // Keep the manager guard above the Suspense boundary so an unauthorized
  // visitor gets a real HTTP redirect, not a client-side one mid-stream.
  await requireManager();
  const eventsPromise = listAuditEvents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          <Suspense fallback={<TextSkeleton className="w-64" />}>
            <AuditSummary dataPromise={eventsPromise} />
          </Suspense>
        </p>
      </div>

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <AuditRows dataPromise={eventsPromise} />
      </Suspense>
    </div>
  );
}

async function AuditSummary({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof listAuditEvents>;
}) {
  const events = await dataPromise;
  return <>Every staff action, most recent first (last {events.length}).</>;
}

async function AuditRows({
  dataPromise,
}: {
  dataPromise: ReturnType<typeof listAuditEvents>;
}) {
  const events = await dataPromise;

  return (
    <>
      {/* Mobile: audit event cards */}
      <div className="divide-y overflow-hidden rounded-lg border md:hidden">
        {events.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        )}
        {events.map((e) => {
          const href = targetHref(e.targetType, e.targetId);
          return (
            <div key={e.id} className="space-y-1.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {e.action}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {istDateTime(e.createdAt)}
                </span>
              </div>
              <p className="text-sm">
                {e.actorEmail}
                {e.targetType && (
                  <>
                    {" · "}
                    {href ? (
                      <Link href={href} className="underline-offset-2 hover:underline">
                        {e.targetType}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{e.targetType}</span>
                    )}
                  </>
                )}
              </p>
              {e.detail ? (
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {JSON.stringify(e.detail)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No activity recorded yet.
                </TableCell>
              </TableRow>
            )}
            {events.map((e) => {
              const href = targetHref(e.targetType, e.targetId);
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {istDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">{e.actorEmail}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.targetType ? (
                      href ? (
                        <Link href={href} className="underline-offset-2 hover:underline">
                          {e.targetType}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{e.targetType}</span>
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground">
                    {e.detail ? JSON.stringify(e.detail) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
