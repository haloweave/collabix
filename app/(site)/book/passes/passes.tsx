"use client";
import { useEffect, useState, type ReactNode } from "react";
import { TERM_PLANS, findTermPlan, money, termMonthlyMinor, type TermPlan, type TermPlanKey } from "@/lib/tariff";
import { MAX_MONTHS, MAX_START_DAYS, MAX_YEARS, priceTerms, termWindow, type TermUnit } from "@/lib/domain/term";
import DateStrip from "../date-strip";
import { BookTabs } from "../book-tabs";
import { SeatPicker, pickedText, useSeatPicks, type Slot } from "../seat-picker";
import { BookingProgress, BookingSummary, CheckoutSteps, COUPON_ERRORS, STEPS, rupees, useCheckout } from "../checkout";

/** How many of each plan are in the booking; a plan left out is zero. */
type Cart = Partial<Record<TermPlanKey, number>>;
type Choice = { cart: Cart; unit: TermUnit; count: number; date: string };

// Per-booking cap on desks, and on cabins, matching the server's limit.
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const GROUPS = [
  { space: "desk", title: "Shared desks", each: "one desk per person" },
  { space: "cabin", title: "Private cabins", each: "4 people per cabin" },
] as const;

// A flexi hot desk is any desk on the day, so only fixed desks and cabins are picked.
const isFlexi = (p: TermPlan) => p.key === "hot-desk";

const AVAIL_ERROR = "Could not load availability. Please try again.";

type Avail = { key: string; desks: Slot[]; cabins: Slot[] };

export default function Passes({ initialPlan }: { initialPlan?: string }) {
  const [choice, setChoice] = useState<Choice>(() => ({
    cart: { [findTermPlan(initialPlan ?? "")?.key ?? "hot-desk"]: 1 },
    unit: "month",
    count: DEFAULT_MONTHS,
    date: istDay(),
  }));
  const co = useCheckout();
  const { step, setStep, quote, error, setError } = co;
  const label = STEPS[step];

  // The booking: every plan with at least one desk or cabin, in tariff order.
  const items = TERM_PLANS.map((plan) => ({ plan, spaces: choice.cart[plan.key] ?? 0 })).filter((i) => i.spaces > 0);
  const sum = (pred: (p: TermPlan) => boolean) => items.reduce((n, i) => n + (pred(i.plan) ? i.spaces : 0), 0);
  const wanted = { desk: sum((p) => p.space === "desk"), cabin: sum((p) => p.space === "cabin") };
  const fixedDesks = sum((p) => p.space === "desk" && !isFlexi(p));
  const flexiDesks = wanted.desk - fixedDesks;
  const total = wanted.desk + wanted.cabin;

  const w = termWindow(choice, new Date());
  const win = w.ok ? w.window : null;
  const shown = quote ?? co.withCoupon(priceTerms(items, choice));

  // Desks and cabins for the whole term, tagged with the term they were fetched for.
  const [avail, setAvail] = useState<Avail | null>(null);
  const availKey = win ? `${choice.date}|${choice.unit}|${choice.count}` : null;
  const live = avail && avail.key === availKey ? avail : null;
  const free = live
    ? {
        desk: live.desks.filter((s) => s.available).length,
        cabin: live.cabins.filter((s) => s.available).length,
      }
    : null;
  // The map offers only what the booking has to choose: fixed desks and cabins.
  const slots = live ? [...(fixedDesks ? live.desks : []), ...(wanted.cabin ? live.cabins : [])] : [];
  const picks = useSeatPicks(availKey, slots, { desk: fixedDesks, cabin: wanted.cabin });
  useEffect(() => {
    if (step !== 0 || !availKey) return;
    let cancelled = false;
    const [date, unit, count] = availKey.split("|");
    // Any desk plan reports the desks, any cabin plan the cabins.
    const load = (plan: TermPlanKey): Promise<Slot[]> =>
      fetch(`/api/passes/availability?plan=${plan}&date=${date}&unit=${unit}&count=${count}`)
        // A failed lookup is an error, never "nothing free".
        .then((r) => {
          if (!r.ok) throw new Error(`availability ${r.status}`);
          return r.json();
        })
        .then((d) => d.resources ?? []);
    Promise.all([load("hot-desk"), load("cabin-base")])
      .then(([desks, cabins]) => {
        if (cancelled) return;
        setAvail({ key: availKey, desks, cabins });
        setError((e) => (e === AVAIL_ERROR ? null : e));
      })
      .catch(() => {
        if (!cancelled) setError(AVAIL_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [step, availKey, setError]);

  // What stops the booking as it stands: nothing chosen, or more than is free.
  const short = (["desk", "cabin"] as const).filter((space) => free != null && wanted[space] > free[space]);
  const fits = free != null && total > 0 && short.length === 0;
  const canContinue = label === "Book" && !!win && fits && picks.complete;

  function update(next: Partial<Omit<Choice, "cart">>) {
    setChoice((prev) => {
      const merged = { ...prev, ...next };
      // Switching between months and years starts from that unit's default.
      if (next.unit && next.unit !== prev.unit) merged.count = next.unit === "year" ? 1 : DEFAULT_MONTHS;
      return merged;
    });
  }

  function setSpaces(key: TermPlanKey, spaces: number) {
    setChoice((prev) => ({ ...prev, cart: { ...prev.cart, [key]: Math.min(Math.max(0, spaces), MAX_SPACES) } }));
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
      date: choice.date,
      unit: choice.unit,
      count: choice.count,
      items: items.map((i) => ({ planKey: i.plan.key, spaces: i.spaces })),
      ...(picks.choosing ? { resourceIds: picks.picked } : {}),
      customerName: co.name.trim(),
      customerEmail: co.email.trim(),
    });
    if (held.ok) return;
    if (held.error === "seat_unavailable") {
      setError(
        total === 1
          ? `That ${wanted.cabin ? "cabin" : "desk"} was just taken for those dates. Please pick another start date.`
          : "Some of those spaces were just taken for those dates. Please check what is free and try again.",
      );
      setStep(0);
    } else {
      setError(COUPON_ERRORS[held.error] ?? "We couldn't hold your pass. Please check your details.");
    }
  }

  function restart() {
    co.reset();
    setAvail(null);
    picks.reset();
  }

  const dates = win ? `${longDate(win.startDate)} – ${longDate(dayBefore(win.endDate))}` : "Choose a start date";
  const planLine = items.length
    ? items.map((i) => (total === 1 ? i.plan.name : `${i.spaces} × ${i.plan.name}`)).join(", ")
    : "Nothing chosen yet";
  const spaceLine =
    [
      flexiDesks ? (flexiDesks === 1 ? "Any shared desk" : `${flexiDesks} people · any shared desks`) : "",
      picks.deskCodes.length
        ? `Fixed ${pickedText(picks.deskCodes, "desk")}`
        : fixedDesks
          ? fixedDesks === 1 ? "Your own fixed desk" : `${fixedDesks} fixed desks`
          : "",
      picks.cabinCodes.length
        ? `Private ${pickedText(picks.cabinCodes, "cabin")}`
        : wanted.cabin
          ? wanted.cabin === 1 ? "A private cabin for 4" : `${wanted.cabin} private cabins for 4 each`
          : "",
    ]
      .filter(Boolean)
      .join(" · ") || "—";
  const holding =
    wanted.desk && wanted.cabin
      ? "your desks and cabins"
      : `your ${wanted.cabin ? "cabin" : "desk"}${total > 1 ? "s" : ""}`;
  // One price line per plan, in the same order as the booking.
  const priceRows = shown.lines.map((l, i): [string, ReactNode] => {
    const item = shown.lines.length === items.length ? items[i] : null;
    const name = item
      ? `${item.plan.name} × ${termLabel(choice.unit, choice.count)}${item.spaces > 1 ? ` × ${item.spaces}` : ""}`
      : l.label;
    return [name, rupees(l.amountMinor)];
  });

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

                {GROUPS.map((g) => {
                  const room = Math.min(MAX_SPACES, free?.[g.space] ?? MAX_SPACES);
                  return (
                    <div key={g.space}>
                      <span className="filter-label">
                        {g.title}
                        <span className="fnote">
                          {" "}· {g.each}
                          {free && ` · ${free[g.space]} free`}
                        </span>
                      </span>
                      <div className="plan-list">
                        {TERM_PLANS.filter((p) => p.space === g.space).map((p) => {
                          const n = choice.cart[p.key] ?? 0;
                          return (
                            <div key={p.key} className={`plan-row ${n > 0 ? "sel" : ""}`}>
                              <div className="plan-info">
                                <span className="pn">{p.name}</span>
                                <span className="pd">{p.blurb}</span>
                              </div>
                              <span className="pp">
                                {choice.unit === "year"
                                  ? money(p.annualMinor / 100)
                                  : money(termMonthlyMinor(p) / 100)}
                                <span className="per"> / {choice.unit}</span>
                              </span>
                              <div className="stepper" role="group" aria-label={`${p.name}: number of ${g.space}s`}>
                                <button
                                  type="button"
                                  aria-label={`One fewer ${p.name}`}
                                  disabled={n <= 0}
                                  onClick={() => setSpaces(p.key, n - 1)}
                                >
                                  −
                                </button>
                                <span className="stepper-val" aria-live="polite">{n}</span>
                                <button
                                  type="button"
                                  aria-label={`One more ${p.name}`}
                                  disabled={wanted[g.space] >= room}
                                  onClick={() => setSpaces(p.key, n + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <p className="avail-hint plan-hint">
                  Need both? Add desks and cabins together and pay for them in one booking.
                </p>

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
                {win && free && total === 0 && (
                  <p className="avail-hint" role="status">
                    Add at least one desk or cabin to continue.
                  </p>
                )}
                {win &&
                  free &&
                  short.map((space) => (
                    <p key={space} className="avail-hint" role="status">
                      {free[space] === 0
                        ? `No ${space}s are free for the whole of ${dates}.`
                        : `Only ${plural(free[space], space)} ${free[space] === 1 ? "is" : "are"} free for the whole term, and you have chosen ${wanted[space]}.`}{" "}
                      Please choose fewer, another start date or a shorter term.
                    </p>
                  ))}
                {win && fits && <SeatPicker picks={picks} slots={slots} />}
                <p className="avail-hint">
                  Once you&#39;ve paid, our team will be in touch about the agreement and
                  security deposit.
                </p>
              </>
            )}

            <CheckoutSteps
              co={co}
              onSubmitDetails={submitDetails}
              holding={holding}
              onRestart={restart}
              details={
                <>
                  <p>{planLine} · {termLabel(choice.unit, choice.count)}</p>
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
              [items.length > 1 ? "Plans" : "Plan", planLine],
              ["Space", spaceLine],
              ["Term", termLabel(choice.unit, choice.count)],
              ["Dates", dates],
              ...priceRows,
            ]}
          />
        </div>
      </div>
    </section>
  );
}
