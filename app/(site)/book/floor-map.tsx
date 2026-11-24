"use client";
import { useEffect, useRef, useState } from "react";
import { FLOOR, FLOOR_OUTLINE, contextShapes, furniture, renderSeats, roomSeating } from "@/lib/floorplan";
import type { RenderSeat } from "@/lib/floorplan";
import { POD_NAMES, POD_TYPE, SPACE_NAMES, spaceLabel } from "@/lib/space-names";

// "Origin, Axis, Summit" → "Executive Cabins", grouped for the key under the map.
const KEY = [
  ...Object.entries(
    Object.values(SPACE_NAMES).reduce<Record<string, string[]>>((acc, s) => {
      (acc[s.type] ??= []).push(s.name);
      return acc;
    }, {}),
  ).map(([type, names]) => ({ type: names.length > 1 ? `${type}s` : type, names })),
  { type: `${POD_TYPE}s`, names: [...POD_NAMES] },
];

type Slot = { resourceId: string; code: string; available: boolean };

// Zoom steps, as multiples of "the whole floor fits the width". A phone opens
// zoomed in so desks and rooms are big enough to read and tap.
const ZOOMS = [1, 1.5, 2, 2.5, 3] as const;
const PHONE_WIDTH = 640;
const PHONE_ZOOM = 2.5;

// An interactive floor map: seat and room glyphs placed where the architect's
// plan puts them, colour-coded from live availability. Only resources
// present in `slots` (i.e. matching the chosen space type) are interactive;
// `shown` spaces (cabins on a day pass) display free or booked but can't be
// picked; everything else is drawn faint for orientation.
export default function FloorMap({
  slots,
  selectedResourceIds,
  onSelect,
  priceLabel,
  shown = [],
}: {
  slots: Slot[];
  selectedResourceIds: string[];
  onSelect: (resourceId: string) => void;
  priceLabel?: string;
  shown?: Slot[];
}) {
  const seats = renderSeats(slots, selectedResourceIds, shown);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1);

  // Phones open zoomed in (checked after mount, so server and client agree).
  // It's the screen that matters: the map's own column is narrow on desktop too.
  useEffect(() => {
    if (window.matchMedia(`(max-width: ${PHONE_WIDTH}px)`).matches) setZoom(PHONE_ZOOM);
  }, []);

  // Keep the picked space (or, failing that, the first free one) in view when
  // the zoom or the pick changes.
  const focusKey = `${zoom}|${selectedResourceIds.join(",")}`;
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || zoom === 1) return;
    const target =
      box.querySelector<SVGGraphicsElement>(".fm-selected") ??
      box.querySelector<SVGGraphicsElement>(".fm-available");
    if (!target) return;
    const b = box.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    box.scrollTo({
      left: box.scrollLeft + t.left - b.left - (b.width - t.width) / 2,
      top: box.scrollTop + t.top - b.top - (b.height - t.height) / 2,
      behavior: "smooth",
    });
  }, [focusKey, zoom]);

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? ZOOMS.length - 1 : i) + dir))];
    setZoom(next);
  };

  return (
    <div className="floor-map">
      <div className="floor-tools">
        <p className="floor-swipe">
          {zoom > 1 ? "Drag the map to look around." : "The whole floor."} Use − / + to zoom.
        </p>
        <div className="floor-zoom" role="group" aria-label="Zoom the floor map">
          <button type="button" onClick={() => step(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => step(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>
            Fit
          </button>
        </div>
      </div>
      <div className={`floor-scroll ${zoom > 1 ? "zoomed" : ""}`} ref={scrollRef}>
        <svg
          viewBox={`0 0 ${FLOOR.width} ${FLOOR.height}`}
          className="floor-svg"
          style={{ width: `${zoom * 100}%` }}
          role="group"
          aria-label="Floor plan — choose a spot"
        >
          {/* Building outline */}
          <polygon
            className="fm-shell"
            points={FLOOR_OUTLINE.map(([x, y]) => `${x},${y}`).join(" ")}
          />

          {/* Non-bookable context, for orientation only */}
          {contextShapes.map((s, i) => (
            <g key={`ctx-${i}`} className={`fm-ctx fm-ctx-${s.kind}`}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={8} />
              <text x={s.x + s.w / 2} y={s.y + s.h / 2 + (s.labelDy ?? 0)} className="fm-ctx-label">
                {s.label}
              </text>
              {/* The booths aren't sold online; they show as booked. */}
              {s.kind === "booth" && (
                <text x={s.x + s.w / 2} y={s.y + s.h - 14} className="fm-booked-tag fm-booth-tag">BOOKED</text>
              )}
            </g>
          ))}

          {/* Fixed furniture in the shared areas */}
          {furniture.map((f, i) => (
            <rect
              key={`furn-${i}`}
              className="fm-furn"
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={f.shape === "seat" ? 9 : 5}
            />
          ))}

          {/* Bookable seats */}
          {seats.map((seat) =>
            seat.kind === "room" ? (
              <RoomGlyph
                key={seat.code}
                seat={seat}
                onSelect={onSelect}
                priceLabel={priceLabel}
              />
            ) : (
              <DeskGlyph
                key={seat.code}
                seat={seat}
                onSelect={onSelect}
                priceLabel={priceLabel}
              />
            ),
          )}
        </svg>
      </div>

      <div className="floor-legend" aria-hidden="true">
        <span className="lg lg-avail">Available</span>
        <span className="lg lg-sel">Selected</span>
        <span className="lg lg-taken">Booked</span>
      </div>
      <dl className="floor-key">
        {KEY.map((k) => (
          <div key={k.type}>
            <dt>{k.names.join(", ")}</dt>
            <dd>{k.type}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function interactiveProps(
  seat: RenderSeat,
  onSelect: (id: string) => void,
  priceLabel?: string,
) {
  const bookable = seat.state !== "context" && seat.state !== "view";
  const enabled = seat.state === "available" || seat.state === "selected";
  return {
    className: `fm-seat fm-${seat.state}`,
    role: bookable ? "button" : undefined,
    tabIndex: enabled ? 0 : undefined,
    "aria-pressed": bookable ? seat.state === "selected" : undefined,
    "aria-disabled": bookable && !enabled ? true : undefined,
    "aria-label": bookable
      ? `${spaceLabel(seat.code)}${
          seat.state === "unavailable" ? ", booked" : ""
        }${priceLabel && enabled ? `, ${priceLabel}` : ""}`
      : undefined,
    onClick: enabled && seat.resourceId ? () => onSelect(seat.resourceId!) : undefined,
    onKeyDown:
      enabled && seat.resourceId
        ? (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(seat.resourceId!);
            }
          }
        : undefined,
  };
}

// One string, as <title> takes a single text child.
function seatTitle(seat: RenderSeat, priceLabel?: string) {
  const taken =
    seat.state === "unavailable" ? " — booked" : seat.state === "view" ? " — free · book on Monthly & annual passes" : "";
  const price =
    priceLabel && (seat.state === "available" || seat.state === "selected") ? ` · ${priceLabel}` : "";
  return `${spaceLabel(seat.code)}${taken}${price}`;
}

function DeskGlyph({
  seat,
  onSelect,
  priceLabel,
}: {
  seat: RenderSeat;
  onSelect: (id: string) => void;
  priceLabel?: string;
}) {
  const { x, y, w, h } = seat;
  // The chair takes a band on its side of the footprint; the desk plate fills
  // the rest, so two facing desks in a bank meet along the spine.
  const side = seat.chair ?? "bottom";
  const band = 26;
  const across = side === "left" || side === "right";
  const plate = {
    x: side === "left" ? x + band : x,
    y: side === "top" ? y + band : y,
    w: across ? w - band : w,
    h: across ? h : h - band,
  };
  const chair = across
    ? { x: side === "left" ? x + 3 : x + w - band + 5, y: y + h / 2 - 17, w: band - 8, h: 34 }
    : { x: x + w / 2 - 17, y: side === "top" ? y + 3 : y + h - band + 5, w: 34, h: band - 8 };
  return (
    <g {...interactiveProps(seat, onSelect, priceLabel)}>
      <title>{seatTitle(seat, priceLabel)}</title>
      <rect className="fm-desk" x={plate.x + 2} y={plate.y + 2} width={plate.w - 4} height={plate.h - 4} rx={5} />
      <rect className="fm-chair" x={chair.x} y={chair.y} width={chair.w} height={chair.h} rx={7} />
      <text x={plate.x + plate.w / 2} y={plate.y + plate.h / 2 + 2} className="fm-desk-num">
        {seat.code.replace("D-", "")}
      </text>
    </g>
  );
}

function RoomGlyph({
  seat,
  onSelect,
  priceLabel,
}: {
  seat: RenderSeat;
  onSelect: (id: string) => void;
  priceLabel?: string;
}) {
  const { x, y, w, h } = seat;
  const seating = roomSeating[seat.code];
  const at = seating?.label ?? { x: x + w / 2, y: y + 26 };
  const lines = seating?.label?.lines ?? [seat.label ?? seat.code];
  return (
    <g {...interactiveProps(seat, onSelect, priceLabel)}>
      <title>{seatTitle(seat, priceLabel)}</title>
      <rect className="fm-room" x={x} y={y} width={w} height={h} rx={8} />
      {seating && (
        <>
          <rect
            className="fm-room-table"
            x={seating.table.x}
            y={seating.table.y}
            width={seating.table.w}
            height={seating.table.h}
            rx={6}
          />
          {seating.chairs.map(([cx, cy], i) => (
            <rect key={i} className="fm-room-chair" x={cx - 14} y={cy - 14} width={28} height={28} rx={8} />
          ))}
        </>
      )}
      <text x={at.x} y={at.y} className="fm-room-label">
        {lines.map((line, i) => (
          <tspan key={line} x={at.x} dy={i === 0 ? 0 : 22}>
            {line}
          </tspan>
        ))}
      </text>
      {seat.state === "unavailable" && (
        <text x={x + w / 2} y={y + h - 22} className="fm-booked-tag">BOOKED</text>
      )}
    </g>
  );
}
