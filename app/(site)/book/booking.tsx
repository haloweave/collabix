"use client";
import { useEffect, useState, type ReactNode } from "react";
import { bookableProduct, type BookableProduct } from "@/lib/tariff";
import { priceBooking, productWindow, type WindowInput } from "@/lib/domain/booking";
import StepChoose, { type Choice } from "./step-choose";
import { BookTabs } from "./book-tabs";
import { BookingProgress, BookingSummary, CheckoutSteps, STEPS, rupees, useCheckout } from "./checkout";

type Slot = { resourceId: string; code: string; available: boolean };

// Per-booking cap on people for a pass, matching the server's limit.
const MAX_PEOPLE = 20;

// "2026-10-27" for the IST calendar day `offset` days from today.
function istDay(offset = 0): string {
  return new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

// "22:00–4:00 IST (next day)" — room bookings may run past midnight.
function timeRange(w: WindowInput) {
  const end = w.start + w.duration;
  if (end === 24) return `${w.start}:00–midnight IST`;
  return `${w.start}:00–${end % 24}:00 IST${end > 24 ? " (next day)" : ""}`;
}

// The earliest bookable start for a product on or after `date` (IST): today's
// past hours are skipped, rolling to the next day when nothing is left.
function firstOpening(p: BookableProduct, duration: number, from = istDay()): { date: string; start: number } {
  const now = new Date();
  const starts = p.key === "day-full" ? [8] : Array.from({ length: 24 }, (_, i) => i);
  for (let off = 0; off < 3; off++) {
    const date = off === 0 ? from : new Date(new Date(`${from}T00:00:00Z`).getTime() + off * 86_400_000).toISOString().slice(0, 10);
    for (const start of starts) {
      if (productWindow(p, { date, start, duration }, now).ok) return { date, start };
    }
  }
  return { date: from, start: 8 };
}

function initialChoice(key?: string): Choice {
  const product = bookableProduct(key ?? "") ?? bookableProduct("day-full")!;
  return { productKey: product.key, duration: 1, people: 1, ...firstOpening(product, 1) };
}

const AVAIL_ERROR = "Could not load availability. Please try again.";

export default function Booking({ initialProduct }: { initialProduct?: string }) {
  const [choice, setChoice] = useState<Choice>(() => initialChoice(initialProduct));
  const co = useCheckout();
  const { step, setStep, quote, error, setError } = co;

  // Availability, tagged with the window it was fetched for.
  const [avail, setAvail] = useState<{ key: string; slots: Slot[] } | null>(null);
  // The window the server held. Steps after Book show this, not a window
  // recomputed from the clock (which goes null once the start time passes).
  const [heldWin, setHeldWin] = useState<WindowInput | null>(null);

  const product = bookableProduct(choice.productKey)!;
  const label = STEPS[step];
  const w = productWindow(product, choice, new Date());
  const win = w.ok ? w.window : null;
  // Instant on-device estimate from the tariff; the server re-prices on hold
  // and that held quote is what's charged.
  const estimate = win ? priceBooking(product, win, choice.people) : null;
  const shown = quote ?? estimate;
  const shownWin = heldWin ?? win;

  const isPass = product.kind === "pass";

  // Live availability for the chosen product and window on the Book step.
  const availKey = win ? `${product.key}|${win.date}|${win.start}|${win.duration}` : null;
  const free =
    avail && avail.key === availKey ? avail.slots.filter((s) => s.available).length : null;
  const maxPeople = Math.max(1, Math.min(MAX_PEOPLE, free ?? MAX_PEOPLE));
  useEffect(() => {
    if (step !== 0 || !availKey) return;
    let cancelled = false;
    const [key, date, start, duration] = availKey.split("|");
    fetch(`/api/availability?product=${key}&date=${date}&start=${start}&duration=${duration}`)
      // A failed lookup is an error, never "nothing free".
      .then((r) => {
        if (!r.ok) throw new Error(`availability ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setAvail({ key: availKey, slots: d.resources ?? [] });
        setError((e) => (e === AVAIL_ERROR ? null : e));
      })
      .catch(() => {
        if (!cancelled) setError(AVAIL_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [step, availKey, setError]);

  const canContinue =
    label === "Book" && !!win && free != null && (isPass ? free >= choice.people : free >= 1);

  // Changing product or date keeps the rest of the choice when it still makes
  // sense, otherwise moves to that product's first opening.
  function updateChoice(next: Partial<Choice>) {
    setChoice((prev) => {
      const merged = { ...prev, ...next };
      const p = bookableProduct(merged.productKey)!;
      if (!productWindow(p, merged, new Date()).ok && (next.productKey || next.date)) {
        Object.assign(merged, firstOpening(p, merged.duration, merged.date));
      }
      merged.people = Math.min(merged.people, MAX_PEOPLE);
      return merged;
    });
  }

  const holdErrors: Record<string, string> = {
    "that time has already passed": "That time has just passed. Please pick another time.",
    not_enough_desks: "Not enough desks are free that day any more. Please try fewer people or another day.",
    seat_unavailable: `${product.name} was just booked for that time. Please pick another time.`,
  };

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (co.name.trim().length < 2) return;
    // Re-check against the clock now, not the last render: the start time may
    // have passed while the guest was typing.
    const fresh = productWindow(product, choice, new Date());
    if (!fresh.ok) {
      setError("That time has just passed. Please pick another time.");
      setStep(0);
      return;
    }
    const held = await co.hold("/api/bookings/hold", {
      productKey: product.key,
      date: choice.date,
      start: fresh.window.start,
      duration: fresh.window.duration,
      people: isPass ? choice.people : 1,
      customerName: co.name.trim(),
      customerEmail: co.email.trim(),
    });
    if (held.ok) {
      setHeldWin(fresh.window);
      return;
    }
    setError(holdErrors[held.error] ?? "We couldn't hold your booking. Please check your details.");
    if (holdErrors[held.error]) setStep(0);
  }

  function restart() {
    co.reset();
    setChoice(initialChoice(choice.productKey));
    setAvail(null);
    setHeldWin(null);
  }

  const whoWhere = isPass
    ? `${choice.people} ${choice.people === 1 ? "person" : "people"} · any shared desk`
    : product.name;
  const holding = !isPass ? "your room" : choice.people > 1 ? "your desks" : "your desk";

  return (
    <section className="pad section-ivory booking-page">
      <div className="wrap">
        <BookTabs current="day" />
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
                <StepChoose
                  choice={choice}
                  onChange={updateChoice}
                  freeDesks={isPass ? free : null}
                  maxPeople={maxPeople}
                />
                {win && free === 0 && (
                  <p className="avail-hint" role="status">
                    {isPass ? "No desks free that day. Please pick another day." : `${product.name} is booked at that time. Please pick another time.`}
                  </p>
                )}
                {win && isPass && free != null && free > 0 && free < choice.people && (
                  <p className="avail-hint" role="status">Only {free} desks are free that day.</p>
                )}
              </>
            )}

            <CheckoutSteps
              co={co}
              onSubmitDetails={submitDetails}
              holding={holding}
              onRestart={restart}
              details={
                <>
                  <p>{product.name} · {whoWhere}</p>
                  {shownWin && <p>{shownWin.date} · {timeRange(shownWin)}</p>}
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
              ["Booking", product.name],
              ["Date", shownWin?.date ?? choice.date],
              ["Time", shownWin ? timeRange(shownWin) : "Choose a time"],
              [isPass ? "People" : "Room", isPass ? `${choice.people} · any shared desk` : product.name],
              ...(shown?.lines ?? []).map((l): [string, ReactNode] => [
                l.qty > 1 || product.kind === "room" ? `${l.label} × ${l.qty}` : l.label,
                rupees(l.amountMinor),
              ]),
            ]}
          />
        </div>
      </div>
    </section>
  );
}
