"use client";

import { useEffect, useState } from "react";
import { walkInDesks, type WalkInDesk } from "@/app/admin/(dash)/bookings/actions";
import type { RepeatEvery } from "@/lib/recurrence";
import { Button } from "@/components/ui/button";

/** Optional desk choice for a walk-in pass: pick the exact desks to block, or
 * leave it empty and the booking auto-assigns free desks. A desk counts as
 * free only if it's free on every date of a repeating booking. */
export function DeskPicker({
  productKey,
  date,
  start,
  repeat,
  people,
  value,
  onChange,
}: {
  productKey: string;
  date: string;
  start: number;
  repeat?: { every: RepeatEvery; count: number };
  people: number;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const every = repeat?.every;
  const count = repeat?.count;
  const key = [productKey, date, start, every, count].join("|");
  const [loaded, setLoaded] = useState<{ key: string; desks: WalkInDesk[] } | null>(null);
  const desks = loaded?.key === key ? loaded.desks : null;

  useEffect(() => {
    let live = true;
    walkInDesks({ productKey, date, start, repeat: every && count ? { every, count } : undefined })
      .then((d) => live && setLoaded({ key, desks: d }))
      .catch(() => live && setLoaded({ key, desks: [] }));
    return () => {
      live = false;
    };
  }, [key, productKey, date, start, every, count]);

  // Drop picks that are no longer free after the date or time changed.
  useEffect(() => {
    if (!desks) return;
    const free = new Set(desks.filter((d) => d.available).map((d) => d.resourceId));
    const kept = value.filter((id) => free.has(id));
    if (kept.length !== value.length) onChange(kept);
  }, [desks, value, onChange]);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < people) onChange([...value, id]);
  }

  const hint =
    value.length === 0
      ? "Any free desk. Pick desks to block those exact seats."
      : value.length === people
        ? `${value.length} of ${people} picked.`
        : `${value.length} of ${people} picked. Pick ${people - value.length} more, or clear to use any free desk.`;

  return (
    <div className="grid gap-1.5 text-sm sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Desks</span>
        {value.length > 0 && (
          <button type="button" className="text-xs underline" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      {desks === null ? (
        <p className="text-xs text-muted-foreground">Checking which desks are free…</p>
      ) : desks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No desks to choose from for this date.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {desks.map((d) => {
            const picked = value.includes(d.resourceId);
            return (
              <Button
                key={d.resourceId}
                type="button"
                size="sm"
                variant={picked ? "default" : "outline"}
                disabled={!d.available}
                aria-pressed={picked}
                title={d.available ? undefined : "Taken for this time"}
                className={!d.available ? "line-through" : undefined}
                onClick={() => toggle(d.resourceId)}
              >
                {d.code}
              </Button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
