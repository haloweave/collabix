"use client";

const DAYS_SHOWN = 14;

// "2026-10-27" for the IST calendar day `offset` days from today.
function istDay(offset: number): string {
  const ist = new Date(Date.now() + 330 * 60_000 + offset * 86_400_000);
  return ist.toISOString().slice(0, 10);
}

function dayLabel(iso: string, offset: number): { top: string; bottom: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  if (offset === 0) return { top: "Today", bottom: `${day} ${month}` };
  if (offset === 1) return { top: "Tomorrow", bottom: `${day} ${month}` };
  return { top: weekday, bottom: `${day} ${month}` };
}

/** The next two weeks as tappable days, plus a calendar for anything later. */
export default function DateStrip({
  value,
  onChange,
  isDisabled,
}: {
  value: string;
  onChange: (iso: string) => void;
  isDisabled?: (iso: string) => boolean;
}) {
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => istDay(i));
  const later = !days.includes(value);
  return (
    <div className="bk-dates" role="group" aria-label="Date">
      {days.map((iso, i) => {
        const { top, bottom } = dayLabel(iso, i);
        const disabled = isDisabled?.(iso) ?? false;
        return (
          <button
            key={iso}
            type="button"
            className={`bk-date ${value === iso ? "sel" : ""}`}
            aria-pressed={value === iso}
            disabled={disabled}
            onClick={() => onChange(iso)}
          >
            <span className="t">{top}</span>
            <span className="b">{bottom}</span>
          </button>
        );
      })}
      <label className={`bk-date bk-date-pick ${later ? "sel" : ""}`}>
        <span className="t">Later</span>
        <span className="b">{later ? value.slice(5).split("-").reverse().join("/") : "Pick date"}</span>
        <input
          type="date"
          aria-label="Pick a later date"
          min={istDay(0)}
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
