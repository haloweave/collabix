"use client";
import { useState } from "react";
import FloorMap from "./floor-map";

export type Slot = { resourceId: string; code: string; available: boolean };
type Noun = "desk" | "cabin";

// "D-07" reads as desk 07, "C-01" as cabin 1.
const shortCode = (code: string) =>
  code.startsWith("C-") ? String(Number(code.slice(2))) : code.replace("D-", "");

/** "desk 07" or "cabins 1, 2" for the picked codes. */
export const pickedText = (codes: string[], noun: Noun) =>
  `${noun}${codes.length === 1 ? "" : "s"} ${codes.join(", ")}`;

/** Spaces are chosen for the guest unless they untick the box and pick on the
 * floor map. Picks are tagged with the window they were made for, so a change
 * of day, time or term starts them afresh. */
export function useSeatPicks(availKey: string | null, slots: Slot[], count: number, allowed = true) {
  const [auto, setAuto] = useState(true);
  const [picks, setPicks] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const choosing = allowed && !auto;
  // Only picks that are still free, and never more than were asked for.
  const picked =
    choosing && picks.key === availKey
      ? picks.ids
          .filter((id) => slots.some((s) => s.resourceId === id && s.available))
          .slice(-count)
      : [];
  const codes = picked.map((id) => shortCode(slots.find((s) => s.resourceId === id)!.code)).sort();

  // Tap a space to take it, tap again to release it. Once enough are chosen,
  // a new one replaces the earliest pick.
  function toggle(id: string) {
    if (!availKey) return;
    const ids = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id].slice(-count);
    setPicks({ key: availKey, ids });
  }

  return {
    auto,
    setAuto,
    choosing,
    picked,
    codes,
    toggle,
    /** True when nothing more needs choosing before continuing. */
    complete: !choosing || picked.length === count,
    reset: () => setPicks({ key: "", ids: [] }),
  };
}

/** The "pick for me" checkbox and, when it is unticked, the floor map. */
export function SeatPicker({
  picks,
  slots,
  count,
  noun,
}: {
  picks: ReturnType<typeof useSeatPicks>;
  slots: Slot[];
  count: number;
  noun: Noun;
}) {
  const many = count > 1;
  return (
    <>
      <label className="auto-toggle">
        <input type="checkbox" checked={picks.auto} onChange={(e) => picks.setAuto(e.target.checked)} />
        {many ? `Pick our ${noun}s for us` : `Pick a ${noun} for me`}
      </label>
      {picks.choosing && (
        <>
          <FloorMap slots={slots} selectedResourceIds={picks.picked} onSelect={picks.toggle} />
          <p className="avail-hint" role="status">
            {picks.picked.length === count
              ? `You've chosen ${pickedText(picks.codes, noun)}.`
              : `Tap ${many ? `${count} ${noun}s` : `a ${noun}`} on the map. ${picks.picked.length} of ${count} chosen.`}
          </p>
        </>
      )}
    </>
  );
}
