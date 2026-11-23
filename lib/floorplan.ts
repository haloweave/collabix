// Single source of truth for the Collabix floor: geometry traced from the
// architectural plan `Collabix - R.pdf`. Pure data + pure derivations — no
// React, no DB — so both the SVG seat map (app/(site)/book/floor-map.tsx) and
// the inventory seed (lib/db/seed.ts) build from the same source and cannot
// drift apart. Coordinates are plan-relative units (≈ plan millimetres ÷ 11)
// in a top-left origin; see FLOOR for the viewBox. Positions follow the plan's
// layout; sizes are stylised for legibility rather than drawn to scale.

export type SeatKind = "desk" | "room";

export type ChairSide = "left" | "right" | "top" | "bottom";

export type Seat = {
  code: string;
  kind: SeatKind;
  zone: string;
  bankId?: string; // desks only: which deskBank they came from
  chair?: ChairSide; // desks only: which side of the desk the chair sits on
  label?: string;
  capacity: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

// An open-plan desk bank: an anchor (top-left of the first seat) plus a grid.
// Expanded into individual desk seats by seats(), row-major. Each bank is two
// lines of desks pushed together, chairs on the outside: "columns" banks run
// down the floor (chairs left and right), "rows" banks run across it (chairs
// top and bottom).
export type DeskBank = {
  id: string;
  zone: string;
  layout: "columns" | "rows";
  anchor: { x: number; y: number };
  rows: number;
  cols: number;
  dx: number; // horizontal pitch between desks
  dy: number; // vertical pitch between desks
};

export type Room = Omit<Seat, "kind"> & { kind: "room" };

export type ContextShape = {
  kind: string; // pantry | lounge | reception | lobby | lift | stairs | restroom | booth | server | ups | entrance
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  labelDy?: number; // nudge the label off-centre, clear of furniture
};

export type Slot = { resourceId: string; code: string; available: boolean };

/** "view": free, but not part of this booking (e.g. a cabin on the day-pass
 * map), so it's shown for information and isn't clickable. */
export type SeatState = "available" | "selected" | "unavailable" | "view" | "context";

export type RenderSeat = Seat & {
  resourceId: string | null;
  state: SeatState;
};

// The SVG viewBox. The plan is ~19 m × 12.5 m overall: a 4.9 m left wing
// (boardroom, reception, lift lobby) joined to the 13.75 m main block.
export const FLOOR = { width: 1700, height: 1180 } as const;

// The building outline: the left wing sits lower than the main block at the
// top, and the restrooms jut out below the bottom wall.
export const FLOOR_OUTLINE: [number, number][] = [
  [0, 78], [450, 78], [450, 0], [1700, 0], [1700, 1143],
  [745, 1143], [745, 1180], [595, 1180], [595, 1053], [0, 1053],
];

// A seat's footprint, chair included. Banks in "columns" put the chair beside
// the desk; banks in "rows" put it above or below.
const SEAT = {
  columns: { w: 80, h: 84 },
  rows: { w: 70, h: 84 },
} as const;

// Non-bookable orientation shapes — drawn faint, never interactive.
export const contextShapes: ContextShape[] = [
  { kind: "pantry", label: "Coffee", x: 303, y: 90, w: 157, h: 153 },
  { kind: "pantry", label: "Pantry", x: 465, y: 18, w: 335, h: 225 },
  { kind: "lounge", label: "Lounge", x: 543, y: 248, w: 257, h: 260, labelDy: 8 },
  { kind: "reception", label: "Reception", x: 13, y: 475, w: 170, h: 105 },
  { kind: "entrance", label: "Entrance", x: 30, y: 650, w: 150, h: 36 },
  { kind: "lobby", label: "Lift lobby", x: 13, y: 693, w: 262, h: 347 },
  { kind: "lift", label: "Lift", x: 295, y: 693, w: 165, h: 170 },
  { kind: "stairs", label: "Stairs", x: 280, y: 878, w: 315, h: 162 },
  { kind: "restroom", label: "Restrooms", x: 610, y: 878, w: 190, h: 255 },
  { kind: "booth", label: "Booth", x: 1570, y: 673, w: 112, h: 110, labelDy: -30 },
  { kind: "booth", label: "Booth", x: 1570, y: 795, w: 112, h: 110, labelDy: -30 },
  { kind: "booth", label: "Booth", x: 1570, y: 917, w: 112, h: 110, labelDy: -30 },
  { kind: "server", label: "Server", x: 1535, y: 18, w: 147, h: 75 },
  { kind: "ups", label: "UPS", x: 1535, y: 1048, w: 147, h: 77 },
];

// Open-plan desk banks, matching the plan's clusters. rows × cols = desk count.
// Bank order and ids fix the desk numbering (D-01 …), so keep them stable.
export const deskBanks: DeskBank[] = [
  // Ten desks down the middle of the top half, between the lounge and the cabins.
  { id: "center-top", zone: "Open desks", layout: "columns", anchor: { x: 898, y: 22 }, rows: 5, cols: 2, dx: 80, dy: 93 },
  // Four desks between the boardroom and the lounge, under the coffee point.
  { id: "left-mid", zone: "Open desks", layout: "rows", anchor: { x: 313, y: 294 }, rows: 2, cols: 2, dx: 75, dy: 84 },
  // Six desks in the top-right corner, below the server room.
  { id: "right-top", zone: "Open desks", layout: "columns", anchor: { x: 1453, y: 165 }, rows: 3, cols: 2, dx: 80, dy: 100 },
  // Eight desks in the bottom-right, between the lower cabins and the booths.
  { id: "center-bottom", zone: "Open desks", layout: "columns", anchor: { x: 1293, y: 700 }, rows: 4, cols: 2, dx: 80, dy: 105 },
];

// Enclosed rooms, as drawn: the boardroom in the left wing, the 4-seater
// meeting room beside the lift, two cabins top-right and two bottom-centre.
// Capacity is the number of chairs the plan draws in the room (roomSeating).
export const rooms: Room[] = [
  { code: "M-01", kind: "room", zone: "Meeting", label: "The Boardroom", capacity: 8, x: 13, y: 90, w: 285, h: 380 },
  { code: "M-02", kind: "room", zone: "Meeting", label: "Meeting Room (4-seater)", capacity: 4, x: 475, y: 673, w: 325, h: 190 },
  { code: "C-01", kind: "room", zone: "Cabins", label: "Cabin 1", capacity: 3, x: 1155, y: 18, w: 215, h: 240 },
  { code: "C-02", kind: "room", zone: "Cabins", label: "Cabin 2", capacity: 4, x: 1155, y: 263, w: 215, h: 245 },
  { code: "C-03", kind: "room", zone: "Cabins", label: "Cabin 3", capacity: 4, x: 925, y: 673, w: 255, h: 225 },
  // Cabin 4 is used as a meeting room (2026-11-23); its code stays C-04 so its
  // booking carries on unchanged.
  { code: "C-04", kind: "room", zone: "Cabins", label: "Meeting Room", capacity: 4, x: 925, y: 903, w: 255, h: 222 },
];

export type Box = { x: number; y: number; w: number; h: number };

// What stands inside each room on the plan: its table and one [x, y] centre per
// chair. `label` moves the room's name off the default top-centre spot where a
// chair or the table would sit under it.
export type RoomSeating = {
  table: Box;
  chairs: [number, number][];
  label?: { x: number; y: number; lines?: string[] };
};

export const roomSeating: Record<string, RoomSeating> = {
  // Long table, three chairs down each side and one at each end.
  "M-01": {
    table: { x: 96, y: 155, w: 118, h: 236 },
    chairs: [[155, 128], [75, 202], [75, 272], [75, 345], [235, 202], [235, 272], [235, 345], [155, 419]],
    label: { x: 155, y: 264, lines: ["The", "Boardroom"] },
  },
  // Table with two chairs on each long side.
  "M-02": {
    table: { x: 560, y: 728, w: 88, h: 124 },
    chairs: [[526, 760], [526, 822], [682, 760], [682, 822]],
  },
  // One chair behind the desk, two visitor chairs facing it.
  "C-01": {
    table: { x: 1233, y: 108, w: 132, h: 62 },
    chairs: [[1303, 76], [1264, 202], [1334, 202]],
    label: { x: 1198, y: 60 },
  },
  "C-02": {
    table: { x: 1230, y: 357, w: 135, h: 64 },
    chairs: [[1264, 326], [1334, 326], [1264, 452], [1334, 452]],
    label: { x: 1198, y: 300 },
  },
  "C-03": {
    table: { x: 932, y: 756, w: 156, h: 64 },
    chairs: [[970, 724], [1056, 724], [970, 852], [1056, 852]],
    label: { x: 1136, y: 795 },
  },
  "C-04": {
    table: { x: 932, y: 984, w: 156, h: 64 },
    chairs: [[970, 952], [1056, 952], [970, 1080], [1056, 1080]],
    label: { x: 1136, y: 1010, lines: ["Meeting", "Room"] },
  },
};

// Fixed furniture in the shared areas, for orientation only: the pantry counter
// and its eight stools, the lounge and lobby sofas, and a chair per booth.
export type Furniture = Box & { shape: "rect" | "seat" };

const seatAt = (cx: number, cy: number): Furniture => ({ shape: "seat", x: cx - 13, y: cy - 13, w: 26, h: 26 });

export const furniture: Furniture[] = [
  { shape: "rect", x: 543, y: 97, w: 201, h: 70 },
  ...[567, 615, 664, 713].flatMap((x) => [seatAt(x, 70), seatAt(x, 194)]),
  { shape: "seat", x: 636, y: 262, w: 40, h: 40 },
  { shape: "seat", x: 716, y: 262, w: 40, h: 40 },
  { shape: "rect", x: 558, y: 318, w: 50, h: 120 },
  { shape: "rect", x: 639, y: 452, w: 116, h: 46 },
  { shape: "rect", x: 22, y: 760, w: 54, h: 180 },
  seatAt(1626, 742),
  seatAt(1626, 864),
  seatAt(1626, 986),
];

/** The rate_plan registry key a reservation on this resource is recorded
 * under when it isn't a sale (member holds, extended bookings). */
export function registryKeyFor(r: { code: string; kind: "desk" | "room" }): string {
  if (r.kind === "desk") return "desk-membership";
  if (r.code === "M-01") return "boardroom";
  if (r.code === "M-02") return "meeting-4";
  return "cabin-membership";
}

// Expand banks + rooms into the flat list of bookable resources. Desks are
// numbered continuously (D-01, D-02, …) in bank/row/column order.
export function seats(): Seat[] {
  const out: Seat[] = [];
  let n = 0;
  for (const bank of deskBanks) {
    const size = SEAT[bank.layout];
    for (let r = 0; r < bank.rows; r++) {
      for (let c = 0; c < bank.cols; c++) {
        n += 1;
        const chair: ChairSide =
          bank.layout === "columns" ? (c === 0 ? "left" : "right") : r === 0 ? "top" : "bottom";
        out.push({
          code: `D-${String(n).padStart(2, "0")}`,
          kind: "desk",
          zone: bank.zone,
          bankId: bank.id,
          chair,
          capacity: 1,
          x: bank.anchor.x + c * bank.dx,
          y: bank.anchor.y + r * bank.dy,
          w: size.w,
          h: size.h,
        });
      }
    }
  }
  for (const room of rooms) out.push({ ...room });
  return out;
}

export const seatByCode = new Map(seats().map((s) => [s.code, s]));

// Join live availability onto the geometry. A seat whose code is in `slots` is
// interactive (available / unavailable / selected); every other seat — including
// resources of a different type than the chosen plan — falls back to context.
export function renderSeats(
  slots: Slot[],
  selectedResourceIds: string[],
  /** Spaces outside this booking whose free/booked state is still shown. */
  shown: Slot[] = [],
): RenderSeat[] {
  const byCode = new Map(slots.map((s) => [s.code, s]));
  const shownByCode = new Map(shown.map((s) => [s.code, s]));
  const selected = new Set(selectedResourceIds);
  return seats().map((seat) => {
    const slot = byCode.get(seat.code);
    if (!slot) {
      const view = shownByCode.get(seat.code);
      if (!view) return { ...seat, resourceId: null, state: "context" };
      return { ...seat, resourceId: null, state: view.available ? "view" : "unavailable" };
    }
    let state: SeatState = slot.available ? "available" : "unavailable";
    if (selected.has(slot.resourceId)) state = "selected";
    return { ...seat, resourceId: slot.resourceId, state };
  });
}

// Team-clustered auto-selection: choose up to n available desks, preferring a
// single bank so a team sits together, spreading across banks only if no one
// bank can fit them. Preserves the order of `availableCodes`; ignores unknown
// codes. Rooms are single-select and never auto-assigned.
export function autoAssignDesks(availableCodes: string[], n: number): string[] {
  if (n <= 0) return [];
  const bankByCode = new Map<string, string>();
  for (const s of seats()) {
    if (s.kind === "desk" && s.bankId) bankByCode.set(s.code, s.bankId);
  }

  const byBank = new Map<string, string[]>();
  for (const code of availableCodes) {
    const bank = bankByCode.get(code);
    if (!bank) continue; // skip unknown / non-desk codes
    const list = byBank.get(bank) ?? [];
    list.push(code);
    byBank.set(bank, list);
  }

  // 1) A single bank that can fit the whole team.
  for (const codes of byBank.values()) {
    if (codes.length >= n) return codes.slice(0, n);
  }

  // 2) Spread: take from the banks with the most availability until n (or dry).
  const out: string[] = [];
  for (const codes of [...byBank.values()].sort((a, b) => b.length - a.length)) {
    for (const code of codes) {
      if (out.length >= n) return out;
      out.push(code);
    }
  }
  return out;
}
