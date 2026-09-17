// Single source of truth for the Collabix floor: geometry read (by eye, stylized)
// from the architectural plan `Collabix - R.pdf`. Pure data + pure derivations —
// no React, no DB — so both the SVG seat map (app/home/booking/floor-map.tsx)
// and the inventory seed (lib/db/seed.ts) build from the same source and cannot
// drift apart. Coordinates are plan-relative units (≈ plan millimetres ÷ 10) in
// a top-left origin; see FLOOR for the viewBox. Bank counts are the one thing
// read from a CAD raster — each is a one-line edit here if the real numbers differ.

export type SeatKind = "desk" | "room";

export type Seat = {
  code: string;
  kind: SeatKind;
  zone: string;
  label?: string;
  capacity: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

// An open-plan desk bank: an anchor (top-left of the first desk) plus a grid.
// Expanded into individual desk seats by seats(), row-major.
export type DeskBank = {
  id: string;
  zone: string;
  anchor: { x: number; y: number };
  rows: number;
  cols: number;
  dx: number; // horizontal pitch between desks
  dy: number; // vertical pitch between desks
};

export type Room = Omit<Seat, "kind"> & { kind: "room" };

export type ContextShape = {
  kind: string; // pantry | lounge | stairs | restroom | server | ups | entrance
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Slot = { resourceId: string; code: string; available: boolean };

export type SeatState = "available" | "selected" | "unavailable" | "context";

export type RenderSeat = Seat & {
  resourceId: string | null;
  state: SeatState;
};

// The SVG viewBox. The plan is ~13.75 m × 12.5 m; height trimmed slightly to
// match the drawn (L-notched) footprint at this stylised fidelity.
export const FLOOR = { width: 1375, height: 1180 } as const;

const DESK_W = 62;
const DESK_H = 72; // desk plate + chair back

// Non-bookable orientation shapes — drawn faint, never interactive.
export const contextShapes: ContextShape[] = [
  { kind: "pantry", label: "Pantry", x: 430, y: 40, w: 170, h: 210 },
  { kind: "lounge", label: "Lounge", x: 430, y: 270, w: 180, h: 200 },
  { kind: "lounge", label: "Lounge", x: 40, y: 720, w: 200, h: 260 },
  { kind: "stairs", label: "Stairs", x: 250, y: 560, w: 110, h: 260 },
  { kind: "restroom", label: "Restrooms", x: 430, y: 730, w: 150, h: 150 },
  { kind: "server", label: "CCTV / Server", x: 1185, y: 40, w: 170, h: 120 },
  { kind: "ups", label: "UPS", x: 1185, y: 1000, w: 170, h: 120 },
  { kind: "entrance", label: "Entrance", x: 60, y: 1090, w: 180, h: 60 },
];

// Open-plan desk banks, matching the plan's clusters. rows × cols = desk count.
export const deskBanks: DeskBank[] = [
  { id: "center-top", zone: "Open desks", anchor: { x: 650, y: 70 }, rows: 5, cols: 2, dx: 95, dy: 95 },
  { id: "left-mid", zone: "Open desks", anchor: { x: 70, y: 360 }, rows: 2, cols: 2, dx: 95, dy: 95 },
  { id: "right-top", zone: "Open desks", anchor: { x: 1070, y: 180 }, rows: 3, cols: 2, dx: 95, dy: 95 },
  { id: "center-bottom", zone: "Open desks", anchor: { x: 640, y: 570 }, rows: 4, cols: 2, dx: 95, dy: 92 },
  { id: "right-bottom", zone: "Open desks", anchor: { x: 900, y: 570 }, rows: 4, cols: 2, dx: 95, dy: 92 },
  { id: "right-col", zone: "Open desks", anchor: { x: 1180, y: 570 }, rows: 4, cols: 1, dx: 0, dy: 92 },
  { id: "left-bottom", zone: "Open desks", anchor: { x: 430, y: 560 }, rows: 2, cols: 2, dx: 95, dy: 92 },
];

// Enclosed, bookable rooms — the top-left boardroom and the right-side cabins.
export const rooms: Room[] = [
  { code: "M-01", kind: "room", zone: "Meeting", label: "Meeting Room", capacity: 8, x: 60, y: 60, w: 240, h: 260 },
  { code: "C-01", kind: "room", zone: "Cabins", label: "Cabin 1", capacity: 4, x: 880, y: 60, w: 170, h: 130 },
  { code: "C-02", kind: "room", zone: "Cabins", label: "Cabin 2", capacity: 4, x: 880, y: 210, w: 170, h: 130 },
];

// Expand banks + rooms into the flat list of bookable resources. Desks are
// numbered continuously (D-01, D-02, …) in bank/row/column order.
export function seats(): Seat[] {
  const out: Seat[] = [];
  let n = 0;
  for (const bank of deskBanks) {
    for (let r = 0; r < bank.rows; r++) {
      for (let c = 0; c < bank.cols; c++) {
        n += 1;
        out.push({
          code: `D-${String(n).padStart(2, "0")}`,
          kind: "desk",
          zone: bank.zone,
          capacity: 1,
          x: bank.anchor.x + c * bank.dx,
          y: bank.anchor.y + r * bank.dy,
          w: DESK_W,
          h: DESK_H,
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
  selectedResourceId: string | null,
): RenderSeat[] {
  const byCode = new Map(slots.map((s) => [s.code, s]));
  return seats().map((seat) => {
    const slot = byCode.get(seat.code);
    if (!slot) return { ...seat, resourceId: null, state: "context" };
    let state: SeatState = slot.available ? "available" : "unavailable";
    if (selectedResourceId && slot.resourceId === selectedResourceId) {
      state = "selected";
    }
    return { ...seat, resourceId: slot.resourceId, state };
  });
}
