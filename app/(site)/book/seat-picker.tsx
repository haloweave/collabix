"use client";
import { useState } from "react";
import FloorMap from "./floor-map";

export type Slot = { resourceId: string; code: string; available: boolean };
type Noun = "desk" | "cabin";
/** How many desks and cabins the guest is to choose. */
export type PickLimits = Record<Noun, number>;

const nounOf = (code: string): Noun => (code.startsWith("C-") ? "cabin" : "desk");

// "D-07" reads as desk 07, "C-01" as cabin 1.
const shortCode = (code: string) =>
  code.startsWith("C-") ? String(Number(code.slice(2))) : code.replace("D-", "");

/** "desk 07" or "cabins 1, 2" for the picked codes. */
export const pickedText = (codes: string[], noun: Noun) =>
  `${noun}${codes.length === 1 ? "" : "s"} ${codes.join(", ")}`;

/** "2 desks and a cabin": what is still to be chosen, or was. */
const countText = (limits: PickLimits) =>
  (["desk", "cabin"] as const)
    .filter((noun) => limits[noun] > 0)
    .map((noun) => (limits[noun] === 1 ? `a ${noun}` : `${limits[noun]} ${noun}s`))
    .join(" and ");

/** Spaces are chosen for the guest unless they untick the box and pick on the
 * floor map. Picks are tagged with the window they were made for, so a change
 * of day, time or term starts them afresh. `count` is a number of desks, or
 * how many desks and cabins when a booking takes both. */
export function useSeatPicks(
  availKey: string | null,
  slots: Slot[],
  count: number | PickLimits,
  allowed = true,
) {
  const limits: PickLimits = typeof count === "number" ? { desk: count, cabin: 0 } : count;
  const total = limits.desk + limits.cabin;
  const [auto, setAuto] = useState(true);
  const [picks, setPicks] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const choosing = allowed && total > 0 && !auto;
  const nounById = new Map(slots.map((s) => [s.resourceId, nounOf(s.code)]));

  // Never more of a kind than was asked for: the latest picks win.
  const trim = (ids: string[]) =>
    ids.filter((id, i) => {
      const noun = nounById.get(id)!;
      const later = ids.slice(i + 1).filter((other) => nounById.get(other) === noun).length;
      return later < limits[noun];
    });

  // Only picks that are still free.
  const picked =
    choosing && picks.key === availKey
      ? trim(picks.ids.filter((id) => slots.some((s) => s.resourceId === id && s.available)))
      : [];
  const codesOf = (noun: Noun) =>
    picked
      .filter((id) => nounById.get(id) === noun)
      .map((id) => shortCode(slots.find((s) => s.resourceId === id)!.code))
      .sort();
  const deskCodes = codesOf("desk");
  const cabinCodes = codesOf("cabin");

  // Tap a space to take it, tap again to release it. Once enough of a kind are
  // chosen, a new one replaces the earliest pick of that kind.
  function toggle(id: string) {
    if (!availKey) return;
    const ids = picked.includes(id) ? picked.filter((p) => p !== id) : trim([...picked, id]);
    setPicks({ key: availKey, ids });
  }

  return {
    auto,
    setAuto,
    choosing,
    limits,
    picked,
    codes: [...deskCodes, ...cabinCodes],
    deskCodes,
    cabinCodes,
    /** "desks 07, 08 and cabin 1" for what has been picked, or "" if nothing. */
    text: [deskCodes.length ? pickedText(deskCodes, "desk") : "", cabinCodes.length ? pickedText(cabinCodes, "cabin") : ""]
      .filter(Boolean)
      .join(" and "),
    toggle,
    /** True when nothing more needs choosing before continuing. */
    complete: !choosing || (deskCodes.length === limits.desk && cabinCodes.length === limits.cabin),
    reset: () => setPicks({ key: "", ids: [] }),
  };
}

/** The "pick for me" checkbox and, when it is unticked, the floor map. */
export function SeatPicker({ picks, slots }: { picks: ReturnType<typeof useSeatPicks>; slots: Slot[] }) {
  const { limits } = picks;
  const total = limits.desk + limits.cabin;
  if (total === 0) return null;
  const nouns = (["desk", "cabin"] as const).filter((noun) => limits[noun] > 0);
  const label =
    total === 1
      ? `Pick a ${nouns[0]} for me`
      : `Pick our ${nouns.map((noun) => (limits[noun] === 1 ? noun : `${noun}s`)).join(" and ")} for us`;
  return (
    <>
      <label className="auto-toggle">
        <input type="checkbox" checked={picks.auto} onChange={(e) => picks.setAuto(e.target.checked)} />
        {label}
      </label>
      {picks.choosing && (
        <>
          <FloorMap slots={slots} selectedResourceIds={picks.picked} onSelect={picks.toggle} />
          <p className="avail-hint" role="status">
            {picks.complete
              ? `You've chosen ${picks.text}.`
              : `Tap ${countText(limits)} on the map. ${picks.picked.length} of ${total} chosen.`}
          </p>
        </>
      )}
    </>
  );
}
