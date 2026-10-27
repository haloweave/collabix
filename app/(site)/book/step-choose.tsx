"use client";
import { useState } from "react";
import { BOOKABLE, money, productPriceMinor, type BookableProduct, type ProductKey } from "@/lib/tariff";
import { HALF_DAY_HOURS, MAX_DURATION, PASS_DAY, productWindow } from "@/lib/domain/booking";
import DateStrip from "./date-strip";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const QUICK_LENGTHS = [1, 2, 3, 4];

export type Choice = {
  productKey: ProductKey;
  date: string;
  start: number;
  duration: number;
  people: number;
};

/** Step 1 of /book: what, when, how long, how many. Every option is a tap. */
export default function StepChoose({
  choice,
  onChange,
  freeDesks,
  maxPeople,
}: {
  choice: Choice;
  onChange: (next: Partial<Choice>) => void;
  /** Free desks for a pass on the chosen day, or null while unknown. */
  freeDesks: number | null;
  maxPeople: number;
}) {
  const product = BOOKABLE.find((p) => p.key === choice.productKey)!;
  const [moreLengths, setMoreLengths] = useState(choice.duration > QUICK_LENGTHS.length);
  const now = new Date();
  const todayIst = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const ok = (p: BookableProduct, input: { date: string; start?: number; duration?: number }) =>
    productWindow(p, input, now).ok;

  const starts =
    product.key === "day-half"
      ? Array.from({ length: PASS_DAY.end - HALF_DAY_HOURS - PASS_DAY.start + 1 }, (_, i) => PASS_DAY.start + i)
      : Array.from({ length: 24 }, (_, i) => i);
  const lengths = moreLengths
    ? Array.from({ length: MAX_DURATION }, (_, i) => i + 1)
    : QUICK_LENGTHS;

  return (
    <>
      <span className="filter-label">What would you like to book?</span>
      <div className="space-pills bk-products">
        {BOOKABLE.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`pill ${p.key === product.key ? "sel" : ""}`}
            aria-pressed={p.key === product.key}
            onClick={() => onChange({ productKey: p.key })}
          >
            <span className="pn">{p.name}</span>
            <span className="pd">{p.blurb}</span>
            <span className="pp">
              {money(productPriceMinor(p, now) / 100)}
              <span className="per">{p.unit === "person" ? (p.key === "day-full" ? " / person / day" : " / person") : " / hour"}</span>
            </span>
          </button>
        ))}
      </div>

      <span className="filter-label">When?</span>
      <DateStrip
        value={choice.date}
        onChange={(date) => onChange({ date })}
        isDisabled={(date) =>
          product.key === "day-full"
            ? !ok(product, { date })
            : !starts.some((start) => ok(product, { date, start, duration: choice.duration }))
        }
      />

      {product.key === "day-full" && (
        <p className="avail-hint">Any shared desk, 08:00–20:00.</p>
      )}

      {product.key !== "day-full" && (
        <>
          <span className="filter-label">
            {product.key === "day-half" ? "Start time · 4-hour block" : "Start time"}
          </span>
          <div className="dur-toggle bk-chips">
            {starts.map((start) => {
              const valid = ok(product, { date: choice.date, start, duration: choice.duration });
              return (
                <button
                  key={start}
                  type="button"
                  className={choice.start === start ? "sel" : ""}
                  aria-pressed={choice.start === start}
                  disabled={!valid}
                  hidden={!valid && choice.date === todayIst}
                  onClick={() => onChange({ start })}
                >
                  {hh(start)}
                </button>
              );
            })}
          </div>
        </>
      )}

      {product.kind === "room" && (
        <>
          <span className="filter-label">How long?</span>
          <div className="dur-toggle bk-chips">
            {lengths.map((d) => (
              <button
                key={d}
                type="button"
                className={choice.duration === d ? "sel" : ""}
                aria-pressed={choice.duration === d}
                onClick={() => onChange({ duration: d })}
              >
                {d} {d === 1 ? "hour" : "hours"}
              </button>
            ))}
            {!moreLengths && (
              <button type="button" onClick={() => setMoreLengths(true)}>
                More…
              </button>
            )}
          </div>
          <p className="avail-hint">Hours between 20:00 and 07:00 are 20% extra, as per the tariff.</p>
        </>
      )}

      {product.kind === "pass" && (
        <div className="seats-control">
          <div className="seats-count">
            <span className="filter-label">People</span>
            <div className="stepper" role="group" aria-label="Number of people">
              <button
                type="button"
                aria-label="One fewer person"
                disabled={choice.people <= 1}
                onClick={() => onChange({ people: choice.people - 1 })}
              >
                −
              </button>
              <span className="stepper-val" aria-live="polite">{choice.people}</span>
              <button
                type="button"
                aria-label="One more person"
                disabled={choice.people >= maxPeople}
                onClick={() => onChange({ people: choice.people + 1 })}
              >
                +
              </button>
            </div>
          </div>
          {freeDesks != null && (
            <span className="avail-hint">
              {freeDesks === 0 ? "No desks free that day." : `${freeDesks} desk${freeDesks === 1 ? "" : "s"} free`}
            </span>
          )}
        </div>
      )}
    </>
  );
}
