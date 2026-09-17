"use client";
import { FLOOR, contextShapes, renderSeats } from "@/lib/floorplan";
import type { RenderSeat } from "@/lib/floorplan";

type Slot = { resourceId: string; code: string; available: boolean };

// A BookMyShow-style interactive floor map: real seat/room glyphs placed at
// their plan positions, colour-coded from live availability. Only resources
// present in `slots` (i.e. matching the chosen space type) are interactive;
// everything else is drawn faint for orientation.
export default function FloorMap({
  slots,
  selectedResourceId,
  onSelect,
  priceLabel,
}: {
  slots: Slot[];
  selectedResourceId: string | null;
  onSelect: (resourceId: string) => void;
  priceLabel?: string;
}) {
  const seats = renderSeats(
    slots,
    selectedResourceId ? [selectedResourceId] : [],
  );

  return (
    <div className="floor-map">
      <div className="floor-scroll">
        <svg
          viewBox={`0 0 ${FLOOR.width} ${FLOOR.height}`}
          className="floor-svg"
          role="group"
          aria-label="Floor plan — choose a spot"
        >
          {/* Outer shell */}
          <rect
            className="fm-shell"
            x={8}
            y={8}
            width={FLOOR.width - 16}
            height={FLOOR.height - 16}
            rx={16}
          />

          {/* Non-bookable context, for orientation only */}
          {contextShapes.map((s, i) => (
            <g key={`ctx-${i}`} className={`fm-ctx fm-ctx-${s.kind}`}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={10} />
              <text x={s.x + s.w / 2} y={s.y + s.h / 2} className="fm-ctx-label">
                {s.label}
              </text>
            </g>
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
        <span className="lg lg-taken">Taken</span>
      </div>
    </div>
  );
}

function interactiveProps(
  seat: RenderSeat,
  onSelect: (id: string) => void,
  priceLabel?: string,
) {
  const bookable = seat.state !== "context";
  const enabled = seat.state === "available" || seat.state === "selected";
  return {
    className: `fm-seat fm-${seat.state}`,
    role: bookable ? "button" : undefined,
    tabIndex: enabled ? 0 : undefined,
    "aria-pressed": bookable ? seat.state === "selected" : undefined,
    "aria-disabled": bookable && !enabled ? true : undefined,
    "aria-label": bookable
      ? `${seat.label ?? seat.code}${
          seat.state === "unavailable" ? ", taken" : ""
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
  const deskH = h - 24; // reserve the lower band for the chair
  return (
    <g {...interactiveProps(seat, onSelect, priceLabel)}>
      <title>
        {seat.label ?? seat.code}
        {seat.state === "unavailable" ? " — taken" : ""}
        {priceLabel && seat.state !== "context" && seat.state !== "unavailable"
          ? ` · ${priceLabel}`
          : ""}
      </title>
      {/* desk plate */}
      <rect className="fm-desk" x={x} y={y} width={w} height={deskH} rx={5} />
      {/* chair back */}
      <path
        className="fm-chair"
        d={`M ${x + w * 0.2} ${y + h - 6}
            q 0 -16 ${w * 0.3} -16
            q ${w * 0.3} 0 ${w * 0.3} 16`}
      />
      <text x={x + w / 2} y={y + deskH / 2 + 4} className="fm-desk-num">
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
  return (
    <g {...interactiveProps(seat, onSelect, priceLabel)}>
      <title>
        {seat.label ?? seat.code}
        {seat.state === "unavailable" ? " — taken" : ""}
        {priceLabel && seat.state !== "context" && seat.state !== "unavailable"
          ? ` · ${priceLabel}`
          : ""}
      </title>
      <rect className="fm-room" x={x} y={y} width={w} height={h} rx={12} />
      {/* table glyph inside the room */}
      <rect
        className="fm-room-table"
        x={x + w * 0.22}
        y={y + h * 0.3}
        width={w * 0.56}
        height={h * 0.32}
        rx={6}
      />
      {/* door notch */}
      <line
        className="fm-room-door"
        x1={x + w * 0.5}
        y1={y + h}
        x2={x + w * 0.72}
        y2={y + h}
      />
      <text x={x + w / 2} y={y + 22} className="fm-room-label">
        {seat.label ?? seat.code}
      </text>
    </g>
  );
}
