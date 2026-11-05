"use client";
import { useEffect, useState, type ReactNode } from "react";
import { TERM_PLANS, findTermPlan, money, termMonthlyMinor, type TermPlanKey } from "@/lib/tariff";
import { MAX_MONTHS, MAX_START_DAYS, MAX_YEARS, priceTerm, termWindow, type TermUnit } from "@/lib/domain/term";
import DateStrip from "../date-strip";
import { BookTabs } from "../book-tabs";
import { BookingProgress, BookingSummary, CheckoutSteps, COUPON_ERRORS, STEPS, rupees, useCheckout } from "../checkout";

type Choice = { planKey: TermPlanKey; unit: TermUnit; count: number; date: string; spaces: number };

// Per-booking cap on desks or cabins, matching the server's limit.
const MAX_SPACES = 20;

// "2026-10-27" for the IST calendar day `offset` days from today.
function istDay(offset = 0): string {
  return new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

// "1 Nov 2026" for a YYYY-MM-DD day.
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// The last day of a term, from its exclusive end date.
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** A monthly pass opens on six months; an annual one on a year. */
const DEFAULT_MONTHS = 6;

const termLabel = (unit: TermUnit, count: number) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

const GROUPS = [
  { space: "desk", title: "Shared desks" },
  { space: "cabin", title: "Private cabins · 4 people" },
] as const;

const AVAIL_ERROR = "Could not load availability. Please try again.";

export default function Passes({ initialPlan }: { initialPlan?: string }) {
  const [choice, setChoice] = useState<Choice>(() => ({
    planKey: findTermPlan(initialPlan ?? "")?.key ?? "hot-desk",
    unit: "month",
    count: DEFAULT_MONTHS,
    date: istDay(),
    spaces: 1,
  }));
  const co = useCheckout();
  const { step, setStep, quote, error, setError } = co;
  const label = STEPS[step];

  const plan = findTermPlan(choice.planKey)!;
  const w = termWindow(choice, new Date());
  const win = w.ok ? w.window : null;
  const shown = quote ?? co.withCoupon(priceTerm(plan, choice));

  // Free desks or cabins for the whole term, tagged with the term it was fetched for.
  const [avail, setAvail] = useState<{ key: string; free: number } | null>(null);
  const availKey = win ? `${plan.key}|${choice.date}|${choice.unit}|${choice.count}` : null;
  const free = avail && avail.key === availKey ? avail.free : null;
  useEffect(() => {
    if (step !== 0 || !availKey) return;
    let cancelled = false;
    const [p, date, unit, count] = availKey.split("|");
    fetch(`/api/passes/availability?plan=${p}&date=${date}&unit=${unit}&count=${count}`)
      // A failed lookup is an error, never "nothing free".
      .then((r) => {
        if (!r.ok) throw new Error(`availability ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setAvail({ key: availKey, free: d.free ?? 0 });
        setError((e) => (e === AVAIL_ERROR ? null : e));
      })
      .catch(() => {
        if (!cancelled) setError(AVAIL_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [step, availKey, setError]);

  const spaceWord = plan.space === "desk" ? "desk" : "cabin";
  const maxSpaces = Math.max(1, Math.min(MAX_SPACES, free ?? MAX_SPACES));
  const canContinue = label === "Book" && !!win && free != null && free >= choice.spaces;
  const spacesLabel = `${choice.spaces} ${spaceWord}${choice.spaces === 1 ? "" : "s"}`;

  function update(next: Partial<Choice>) {
    setChoice((prev) => {
      const merged = { ...prev, ...next };
      // Switching between months and years starts from that unit's default.
      if (next.unit && next.unit !== prev.unit) merged.count = next.unit === "year" ? 1 : DEFAULT_MONTHS;
      // People on a desk plan aren't cabins: moving between desks and cabins starts at one.
      if (findTermPlan(merged.planKey)!.space !== findTermPlan(prev.planKey)!.space) merged.spaces = 1;
      merged.spaces = Math.min(Math.max(1, merged.spaces), MAX_SPACES);
      return merged;
    });
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (co.name.trim().length < 2) return;
    if (!termWindow(choice, new Date()).ok) {
      setError("That start date has passed. Please pick another.");
      setStep(0);
      return;
    }
    const held = await co.hold("/api/passes/hold", {
      ...choice,
      customerName: co.name.trim(),
      customerEmail: co.email.trim(),
    });
    if (held.ok) return;
    if (held.error === "seat_unavailable") {
      setError(`That ${spaceWord} was just taken for those dates. Please pick another start date.`);
      setStep(0);
    } else {
      setError(COUPON_ERRORS[held.error] ?? "We couldn't hold your pass. Please check your details.");
    }
  }

  function restart() {
    co.reset();
    setAvail(null);
  }

  const dates = win ? `${longDate(win.startDate)} – ${longDate(dayBefore(win.endDate))}` : "Choose a start date";
  const n = choice.spaces;
  const spaceLine =
    plan.space === "cabin"
      ? n === 1 ? `A private cabin for ${plan.seats}` : `${n} private cabins for ${plan.seats} each`
      : plan.key === "hot-desk"
        ? n === 1 ? "Any shared desk" : `${n} people · any shared desks`
        : n === 1 ? "Your own fixed desk" : `${n} fixed desks`;

  return (
    <section className="pad section-ivory booking-page">
      <div className="wrap">
        <BookTabs current="term" />
        <BookingProgress step={step} />
        <div className="booking-layout">
          <div className="booking-panel">
            {error && (
              <p className="booking-error" role="alert">
                {error}
              </p>
            )}

            {label === "Book" && (
              <>
                <span className="filter-label">How long?</span>
                <div className="bk-term">
                  <div className="dur-toggle bk-chips">
                    {(["month", "year"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        className={choice.unit === u ? "sel" : ""}
                        aria-pressed={choice.unit === u}
                        onClick={() => update({ unit: u })}
                      >
                        {u === "month" ? "Monthly" : "Annual"}
                      </button>
                    ))}
                  </div>
                  <select
                    className="bk-length"
                    aria-label="Length of the pass"
                    value={choice.count}
                    onChange={(e) => update({ count: Number(e.target.value) })}
                  >
                    {Array.from({ length: choice.unit === "year" ? MAX_YEARS : MAX_MONTHS }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {termLabel(choice.unit, n)}
                      </option>
                    ))}
                  </select>
                </div>
                {choice.unit === "month" && (
                  <p className="avail-hint">Staying 12 months or more? Switch to Annual.</p>
                )}

                {GROUPS.map((g) => (
                  <div key={g.space}>
                    <span className="filter-label">{g.title}</span>
                    <div className="space-pills bk-products">
                      {TERM_PLANS.filter((p) => p.space === g.space).map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          className={`pill ${p.key === plan.key ? "sel" : ""}`}
                          aria-pressed={p.key === plan.key}
                          onClick={() => update({ planKey: p.key })}
                        >
                          <span className="pn">{p.name}</span>
                          <span className="pd">{p.blurb}</span>
                          <span className="pp">
                            {choice.unit === "year"
                              ? money(p.annualMinor / 100)
                              : money(termMonthlyMinor(p) / 100)}
                            <span className="per"> / {choice.unit}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="seats-control">
                  <div className="seats-count">
                    <span className="filter-label">{plan.space === "desk" ? "People" : "Cabins"}</span>
                    <div
                      className="stepper"
                      role="group"
                      aria-label={plan.space === "desk" ? "Number of people" : "Number of cabins"}
                    >
                      <button
                        type="button"
                        aria-label={plan.space === "desk" ? "One fewer person" : "One fewer cabin"}
                        disabled={choice.spaces <= 1}
                        onClick={() => update({ spaces: choice.spaces - 1 })}
                      >
                        −
                      </button>
                      <span className="stepper-val" aria-live="polite">{choice.spaces}</span>
                      <button
                        type="button"
                        aria-label={plan.space === "desk" ? "One more person" : "One more cabin"}
                        disabled={choice.spaces >= maxSpaces}
                        onClick={() => update({ spaces: choice.spaces + 1 })}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <span className="avail-hint">
                    {plan.space === "desk" ? "One desk each" : `Each cabin seats ${plan.seats}`}
                  </span>
                </div>

                <span className="filter-label">Starting</span>
                <DateStrip
                  value={choice.date}
                  onChange={(date) => update({ date })}
                  isDisabled={(date) => !termWindow({ ...choice, date }, new Date()).ok}
                />
                {!w.ok && (
                  <p className="avail-hint" role="status">
                    {w.error === "date is in the past"
                      ? "That date has passed. Please pick another."
                      : `Passes can start up to ${MAX_START_DAYS} days ahead. Please pick an earlier date.`}
                  </p>
                )}
                {win && free != null && (
                  <p className="avail-hint" role="status">
                    {free === 0
                      ? `No ${spaceWord}s are free for the whole of ${dates}. Try another start date or a shorter term.`
                      : free < choice.spaces
                        ? `Only ${free} ${spaceWord}${free === 1 ? " is" : "s are"} free for the whole term. Please choose fewer or another start date.`
                        : `${free} ${spaceWord}${free === 1 ? "" : "s"} free for the whole term.`}
                  </p>
                )}
                <p className="avail-hint">
                  Once you&#39;ve paid, our team will be in touch about the agreement and
                  security deposit.
                </p>
              </>
            )}

            <CheckoutSteps
              co={co}
              onSubmitDetails={submitDetails}
              holding={choice.spaces > 1 ? `your ${spaceWord}s` : `your ${spaceWord}`}
              onRestart={restart}
              details={
                <>
                  <p>{plan.name} · {spacesLabel} · {termLabel(choice.unit, choice.count)}</p>
                  <p>{dates}</p>
                </>
              }
            />

            {label === "Book" && (
              <div className="step-actions end">
                <button
                  className="btn btn-gold"
                  disabled={!canContinue}
                  onClick={() => setStep(1)}
                >
                  Continue →
                </button>
              </div>
            )}
          </div>

          <BookingSummary
            shown={shown}
            final={!!quote}
            rows={[
              ["Plan", plan.name],
              ["Space", spaceLine],
              ["Term", termLabel(choice.unit, choice.count)],
              ["Dates", dates],
              ...shown.lines.map((l): [string, ReactNode] => [
                `${choice.unit === "year" ? "Annual" : "Monthly"} × ${choice.count}${n > 1 ? ` × ${n} ${spaceWord}s` : ""}`,
                rupees(l.amountMinor),
              ]),
            ]}
          />
        </div>
      </div>
    </section>
  );
}
