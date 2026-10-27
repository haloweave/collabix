import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="group relative overflow-hidden shadow-sm transition-shadow hover:shadow-md">
      {/* gold hairline that lights up on hover */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-gold to-gold-light opacity-0 transition-opacity group-hover:opacity-100"
      />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[0.62rem] uppercase leading-snug tracking-[0.16em] text-muted-foreground sm:text-[0.66rem]">
            {title}
          </p>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gold/10 text-gold">
            <Icon className="size-4" />
          </span>
        </div>
        <div className="mt-2 text-xl font-semibold tracking-tight text-primary tabular-nums sm:text-[1.7rem]">
          {value}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
