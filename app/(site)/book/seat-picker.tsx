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

/** The floor map is a primary way to choose: every free space on it can be
 * tapped. Tapping fills a place the booking already has; when every place of
 * that kind is picked, `grow` adds one more to the booking (a desk or a
 * cabin), and untapping a pick that grew the booking shrinks it again. Places
 * left unpicked are assigned by the server. Picks survive a change of day,
 * time or term as long as the spaces are still free then; `prefer` is a space
 * to start picked (the cabin tapped on another product's map).
 * `count` is a number of desks, or how many desks and cabins when a booking
 * takes both. */
export function useSeatPicks(
  availKey: string | null,
  slots: Slot[],
  count: number | PickLimits,
  {
    allowed = true,
    grow,
    shrink,
    prefer,
  }: {
    allowed?: boolean;
    /** Add one more of this kind to the booking; false if it can't. */
    grow?: (noun: Noun) => boolean;
    /** Take one of this kind back out of the booking. */
    shrink?: (noun: Noun) => void;
    /** A resource to start picked until the guest taps something. */
    prefer?: string | null;
  } = {},
) {
  const limits: PickLimits = typeof count === "number" ? { desk: count, cabin: 0 } : count;
  const [picks, setPicks] = useState<{ touched: boolean; ids: string[] }>({ touched: false, ids: [] });
  // "Select my space": ticked by default so the map shows; untick to let us pick.
  const [selectOwn, setSelectOwn] = useState(true);
  const choosing = allowed && selectOwn && slots.length > 0;
  const nounById = new Map(slots.map((s) => [s.resourceId, nounOf(s.code)]));
  const ofNoun = (ids: string[], noun: Noun) => ids.filter((id) => nounById.get(id) === noun).length;

  // Never more of a kind than the booking has: the latest picks win.
  const trim = (ids: string[], lim: PickLimits = limits) =>
    ids.filter((id, i) => {
      const noun = nounById.get(id)!;
      const later = ids.slice(i + 1).filter((other) => nounById.get(other) === noun).length;
      return later < lim[noun];
    });

  // Only picks that are still free.
  const picked =
    choosing
      ? trim(
          (picks.touched ? picks.ids : prefer ? [prefer] : []).filter((id) =>
            slots.some((s) => s.resourceId === id && s.available),
          ),
        )
      : [];
  const codesOf = (noun: Noun) =>
    picked
      .filter((id) => nounById.get(id) === noun)
      .map((id) => shortCode(slots.find((s) => s.resourceId === id)!.code))
      .sort();
  const deskCodes = codesOf("desk");
  const cabinCodes = codesOf("cabin");

  function toggle(id: string) {
    if (!availKey) return;
    const noun = nounById.get(id)!;
    if (picked.includes(id)) {
      // A pick that filled the last place of its kind came from a tap that
      // grew the booking, so releasing it shrinks the booking back.
      if (shrink && ofNoun(picked, noun) === limits[noun]) shrink(noun);
      setPicks({ touched: true, ids: picked.filter((p) => p !== id) });
      return;
    }
    if (ofNoun(picked, noun) < limits[noun]) {
      setPicks({ touched: true, ids: [...picked, id] });
    } else if (grow?.(noun)) {
      setPicks({ touched: true, ids: [...picked, id] });
    } else {
      // Can't grow: the new pick replaces the earliest of its kind.
      setPicks({ touched: true, ids: trim([...picked, id]) });
    }
  }

  return {
    /** Whether this booking has spaces to pick at all (not a room booking). */
    pickable: allowed && slots.length > 0,
    choosing,
    selectOwn,
    setSelectOwn,
    limits,
    picked,
    codes: [...deskCodes, ...cabinCodes],
    deskCodes,
    cabinCodes,
    /** "desks 07, 08 and cabin 1" for what has been picked, or "" if nothing. */
    text: [deskCodes.length ? pickedText(deskCodes, "desk") : "", cabinCodes.length ? pickedText(cabinCodes, "cabin") : ""]
      .filter(Boolean)
      .join(" and "),
    /** How many places of the booking are left for the server to assign. */
    unpicked: limits.desk + limits.cabin - picked.length,
    toggle,
    reset: () => setPicks({ touched: false, ids: [] }),
  };
}

/** The floor map, always shown: tap free spaces to choose them. `switchTo`
 * spaces are tappable too but change what's being booked (a meeting room
 * from a day pass, say) via `onSwitch`; `current` marks the space the booking
 * already holds (a room booking's own room). */
export function SeatPicker({
  picks,
  slots,
  shown,
  switchTo = [],
  onSwitch,
  current = [],
  status: statusText,
}: {
  picks: ReturnType<typeof useSeatPicks>;
  slots: Slot[];
  /** Spaces to show free or booked without being pickable. */
  shown?: Slot[];
  switchTo?: Slot[];
  onSwitch?: (slot: Slot) => void;
  current?: string[];
  /** Replaces the hint under the map. */
  status?: string;
}) {
  if (!picks.pickable && switchTo.length === 0) return null;
  const toggle = picks.pickable && (
    <label className="auto-toggle">
      <input type="checkbox" checked={picks.selectOwn} onChange={(e) => picks.setSelectOwn(e.target.checked)} />
      Select my space
    </label>
  );
  if (picks.pickable && !picks.selectOwn) {
    return (
      <>
        {toggle}
        <p className="avail-hint" role="status">
          We&apos;ll pick the best free space for you. Tick the box to choose on the floor map.
        </p>
      </>
    );
  }
  const kinds = (["desk", "cabin"] as const).filter((noun) => slots.some((s) => nounOf(s.code) === noun));
  const tapWhat = kinds.map((noun) => `a ${noun}`).join(" or ");
  const status =
    statusText ??
    (picks.picked.length
      ? `You've chosen ${picks.text}.${picks.unpicked > 0 ? ` We'll pick the other ${picks.unpicked} for you.` : ""}`
      : `Tap ${tapWhat} on the map to choose it, or leave it to us and we'll pick for you.`);
  const switchIds = new Map(switchTo.map((s) => [s.resourceId, s]));
  const select = (id: string) => {
    const target = switchIds.get(id);
    if (target) onSwitch?.(target);
    else picks.toggle(id);
  };
  return (
    <>
      {toggle}
      <FloorMap
        slots={[...(picks.choosing ? slots : []), ...switchTo]}
        shown={shown}
        selectedResourceIds={[...picks.picked, ...current]}
        onSelect={select}
      />
      <p className="avail-hint" role="status">
        {status}
      </p>
    </>
  );
}
