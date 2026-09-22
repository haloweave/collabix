import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Shared loading skeletons for the admin + staff dashboards. Each roughly
// matches the dimensions of the content it stands in for, so streaming the real
// data in swaps it without shifting the layout (keeps CLS low).

/** An inline text-width bar — use as a Suspense fallback for a count/summary
 * line that lives inside a <p>. Renders a <span> so it's valid inline content. */
export function TextSkeleton({ className = "w-44" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 align-middle animate-pulse rounded bg-primary/10 ${className}`}
    />
  );
}

/** A bordered table placeholder that stands in for both the mobile card list
 * and the desktop table on list pages. */
export function TableSkeleton({
  rows = 6,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-4 border-b px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={`h-4 flex-1 ${c === 0 ? "" : "max-w-[6rem]"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A single stat-card placeholder matching <StatCard>. */
export function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-1.5 sm:p-6 sm:pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-4" />
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="mt-2 h-3 w-28" />
      </CardContent>
    </Card>
  );
}

/** A responsive grid of stat-card placeholders. */
export function StatGridSkeleton({
  count = 4,
  className = "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A chart-shaped card placeholder. */
export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-1.5 h-3 w-56" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-56 w-full" />
      </CardContent>
    </Card>
  );
}

/** A generic card placeholder with a title and a few body lines. */
export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
