"use client";
import { useEffect, useState, type ReactNode } from "react";
import { bookableProduct, money, type BookableProduct } from "@/lib/tariff";
import { priceBooking, productWindow, type WindowInput } from "@/lib/domain/booking";
import StepChoose, { type Choice } from "./step-choose";

type Slot = { resourceId: string; code: string; available: boolean };
type QuoteLine = { label: string; qty: number; unitMinor: number; amountMinor: number };
type Quote = { lines: QuoteLine[]; subtotalMinor: number; taxMinor: number; totalMinor: number };

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

// Exact amount: "₹471" when whole, "₹470.82" otherwise — never rounded away
// from what is charged.
const rupees = (minor: number) =>
  minor % 100 === 0
    ? money(minor / 100)
    : `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

// Steps: Book(0) · Details(1) · Verify(2) · Pay(3) · Done(4)
const STEPS = ["Book", "Details", "Verify", "Pay", "Done"];

// How long we keep asking the server about a payment Cashfree hasn't settled
// yet (the webhook or the bank can lag the modal closing by a few seconds).
const SETTLE_RETRIES = 5;
const SETTLE_DELAY_MS = 2000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Booking({ initialProduct }: { initialProduct?: string }) {
  const [choice, setChoice] = useState<Choice>(() => initialChoice(initialProduct));
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Availability, tagged with the window it was fetched for.
  const [avail, setAvail] = useState<{ key: string; slots: Slot[] } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  // Pay step: what the button is doing right now, for its label.
  const [payPhase, setPayPhase] = useState<"idle" | "opening" | "confirming">("idle");

  const product = bookableProduct(choice.productKey)!;
  const label = STEPS[step];
  const w = productWindow(product, choice, new Date());
  const win = w.ok ? w.window : null;
  // Instant on-device estimate from the tariff; the server re-prices on hold
  // and that held quote is what's charged.
  const estimate = win ? priceBooking(product, win, choice.people) : null;
  const shown = quote ?? estimate;

  const isPass = product.kind === "pass";

  const phoneE164 =
    phone.replace(/\D/g, "").length === 10
      ? `+91${phone.replace(/\D/g, "")}`
      : phone.trim();

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
      .then((r) => (r.ok ? r.json() : { resources: [] }))
      .then((d) => {
        if (!cancelled) setAvail({ key: availKey, slots: d.resources ?? [] });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load availability. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [step, availKey]);

  // Live hold countdown on the Verify step.
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!holdExpiresAt) return;
    const tick = () => {
      const ms = new Date(holdExpiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);
  const mmss = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(
    remaining % 60,
  ).padStart(2, "0")}`;

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
    not_enough_desks: "Not enough desks are free that day any more. Please try fewer people or another day.",
    seat_unavailable: `${product.name} was just booked for that time. Please pick another time.`,
  };

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !win) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productKey: product.key,
          date: choice.date,
          start: win?.start,
          duration: win?.duration,
          people: isPass ? choice.people : 1,
          customerName: name.trim(),
          customerEmail: email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(holdErrors[data.error] ?? "We couldn't hold your booking. Please check your details.");
        if (holdErrors[data.error]) setStep(0);
        return;
      }
      setBookingId(data.bookingId);
      setHoldExpiresAt(data.holdExpiresAt);
      setQuote(data.quote);
      setStep(2); // Verify
      await sendOtp();
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    setError(null);
    const r = await fetch("/api/auth/phone-number/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: phoneE164 }),
    });
    if (!r.ok) setError("Could not send the code. Check the phone number.");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length < 4 || !bookingId) return;
    setBusy(true);
    setError(null);
    try {
      const v = await fetch("/api/auth/phone-number/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneE164, code: otp.trim() }),
      });
      if (!v.ok) {
        setError("That code didn't match. Please try again.");
        return;
      }
      setStep(3); // Pay
    } finally {
      setBusy(false);
    }
  }

  // Pay step: ask the server for a Cashfree order, open the checkout popup,
  // then ask the server to confirm. The popup's result is only a hint — the
  // server settles against Cashfree before any seat is confirmed.
  async function startPayment() {
    if (!bookingId) return;
    setBusy(true);
    setError(null);
    setPayPhase("opening");
    try {
      const p = await fetch("/api/bookings/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, phone: phoneE164 }),
      });
      const data = await p.json();
      if (!p.ok) {
        setError(
          data.error === "hold_expired"
            ? "Your hold expired. Please start again."
            : data.error === "payments_not_configured"
              ? "Online payment isn't available right now. Please try again later."
              : "We couldn't start the payment. Please try again.",
        );
        return;
      }
      if (data.mode !== "disabled") {
        const { load } = await import("@cashfreepayments/cashfree-js");
        const cashfree = await load({ mode: data.mode });
        if (!cashfree) {
          setError("Couldn't load the payment win. Please try again.");
          return;
        }
        const result = await cashfree.checkout({
          paymentSessionId: data.paymentSessionId,
          redirectTarget: "_modal",
        });
        // Closed the popup without paying: one quick check, no retry loop.
        if (result?.error && !result.paymentDetails) {
          setPayPhase("confirming");
          await settle(SETTLE_RETRIES, true);
          return;
        }
      }
      setPayPhase("confirming");
      await settle();
    } catch {
      setError("Something went wrong with the payment win. Please try again.");
    } finally {
      setPayPhase("idle");
      setBusy(false);
    }
  }

  async function settle(attempt = 0, dismissed = false): Promise<void> {
    const c = await fetch("/api/bookings/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    const data = await c.json().catch(() => ({ error: "gateway_error" }));
    if (c.ok) {
      setTicketToken(data.ticketToken ?? null);
      setStep(4); // Done
      return;
    }
    switch (data.error) {
      case "payment_pending":
      case "gateway_error":
        if (dismissed) {
          setError("Payment wasn't completed. Your seat is still held — pay whenever you're ready.");
          return;
        }
        if (attempt < SETTLE_RETRIES) {
          await wait(SETTLE_DELAY_MS);
          return settle(attempt + 1);
        }
        setError(
          "We're still waiting for the bank. If money was debited you'll get your ticket by email within a few minutes — or try paying again.",
        );
        return;
      case "payment_failed":
      case "payment_required":
        setError("Payment didn't go through. Nothing was charged — please try again.");
        return;
      case "seat_lost":
        setError("That booking was taken while you paid. We'll refund you in full — please pick another time.");
        return;
      case "hold_expired":
        setError("Your hold expired. Please start again.");
        return;
      default:
        setError("We couldn't confirm the booking.");
    }
  }

  function restart() {
    setStep(0);
    setChoice(initialChoice(choice.productKey));
    setName("");
    setEmail("");
    setPhone("");
    setAvail(null);
    setBookingId(null);
    setHoldExpiresAt(null);
    setQuote(null);
    setOtp("");
    setError(null);
    setTicketToken(null);
    setPayPhase("idle");
  }

  const whoWhere = isPass
    ? `${choice.people} ${choice.people === 1 ? "person" : "people"} · any shared desk`
    : product.name;
  const heldWord = isPass && choice.people > 1 ? "Desks held" : "Booking held";

  return (
    <section className="pad section-ivory booking-page">
      <div className="wrap">
        <ol className="booking-progress" aria-label="Booking progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={i === step ? "current" : ""}
            >
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="booking-layout">
          <div className="booking-panel">
            <span className="eyebrow">
              Step {step + 1} · {label}
            </span>

            {error && (
              <p className="booking-error" role="alert">
                {error}
              </p>
            )}

            {label === "Book" && (
              <>
                <h2>Book a desk or a meeting room.</h2>
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

            {label === "Details" && (
              <>
                <h2>Your workday, at a glance.</h2>
                <p>
                  We&#39;ll hold your booking and send a one-time code to your
                  phone to confirm — no password needed.
                </p>
                <form onSubmit={submitDetails}>
                  <div className="field">
                    <label htmlFor="booking-name">Full name</label>
                    <input
                      id="booking-name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="booking-email">Email</label>
                    <input
                      id="booking-email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="booking-phone">Mobile number</label>
                    <input
                      id="booking-phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      placeholder="10-digit mobile"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="step-actions">
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => setStep(0)}
                    >
                      ← Back
                    </button>
                    <button
                      className="btn btn-gold"
                      type="submit"
                      disabled={
                        busy ||
                        name.trim().length < 2 ||
                        phone.replace(/\D/g, "").length < 10
                      }
                    >
                      {busy ? "Holding your booking…" : "Hold & send code →"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {label === "Verify" && (
              <>
                <h2>Confirm it&#39;s you.</h2>
                {holdExpiresAt && remaining > 0 ? (
                  <p className="hold-timer" aria-live="polite">
                    {heldWord} for{" "}
                    <strong>{mmss}</strong>
                  </p>
                ) : (
                  <p className="hold-timer expired">Your hold has expired.</p>
                )}
                <p>
                  We sent a 6-digit code to {phoneE164}.
                </p>
                <form onSubmit={verifyOtp}>
                  <div className="field">
                    <label htmlFor="booking-otp">One-time code</label>
                    <input
                      id="booking-otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="otp-input"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div className="step-actions">
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={sendOtp}
                      disabled={busy}
                    >
                      Resend code
                    </button>
                    <button
                      className="btn btn-gold"
                      type="submit"
                      disabled={busy || otp.length < 4 || remaining === 0}
                    >
                      {busy ? "Checking…" : "Verify & continue →"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {label === "Pay" && (
              <>
                <h2>Pay to lock it in.</h2>
                {holdExpiresAt && remaining > 0 ? (
                  <p className="hold-timer" aria-live="polite">
                    {heldWord} for{" "}
                    <strong>{mmss}</strong>
                  </p>
                ) : (
                  <p className="hold-timer expired">Your hold has expired.</p>
                )}
                <p>
                  Your number is verified. Pay securely and your booking is
                  confirmed the moment the bank says yes — your e-ticket arrives
                  by email.
                </p>
                <div className="confirm-details">
                  <p>{product.name} · {whoWhere}</p>
                  {win && <p>{win.date} · {timeRange(win)}</p>}
                  {quote && <p>Total to pay: {rupees(quote.totalMinor)}</p>}
                </div>
                <div className="step-actions">
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={restart}
                    disabled={busy}
                  >
                    Start over
                  </button>
                  <button
                    className="btn btn-gold"
                    type="button"
                    onClick={startPayment}
                    disabled={busy || remaining === 0 || !quote}
                  >
                    {payPhase === "opening"
                      ? "Opening secure checkout…"
                      : payPhase === "confirming"
                        ? "Confirming your payment…"
                        : quote
                          ? `Pay ${rupees(quote.totalMinor)} securely →`
                          : "Pay securely →"}
                  </button>
                </div>
                <p className="avail-hint">
                  Secure payment by Cashfree · UPI, cards, net banking.
                </p>
              </>
            )}

            {label === "Done" && (
              <div className="confirm">
                <h2>You&#39;re booked in.</h2>
                <p>
                  Thanks, {name}. Your booking is confirmed and your account is
                  set up — next time, just verify your number to book.
                </p>
                <div className="confirm-details">
                  <p>{product.name} · {whoWhere}</p>
                  {win && <p>{win.date} · {timeRange(win)}</p>}
                  <p>{email}</p>
                  {quote && <p>Total paid: {rupees(quote.totalMinor)}</p>}
                </div>
                {ticketToken && (
                  <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered SVG QR */}
                    <img
                      src={`/t/${ticketToken}/qr.svg`}
                      alt="Your booking QR code"
                      width={200}
                      height={200}
                      style={{ margin: "0 auto", background: "#fff", padding: 8, borderRadius: 12 }}
                    />
                    <p style={{ fontSize: ".85rem", marginTop: ".5rem" }}>
                      Show this QR at reception to check in. We&#39;ve emailed it to you too.
                    </p>
                    <a className="btn btn-gold" href={`/t/${ticketToken}`} style={{ marginTop: ".75rem" }}>
                      View ticket <span className="arw">→</span>
                    </a>
                  </div>
                )}
                <button
                  className="btn btn-outline"
                  onClick={restart}
                  style={{ marginTop: "1rem" }}
                >
                  Book another
                </button>
              </div>
            )}

            {label === "Book" && (
              <div className="step-actions">
                <button className="btn btn-outline" disabled onClick={() => {}}>
                  ← Back
                </button>
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

          <aside className="summary" aria-label="Booking summary">
            <div className="s-head">
              <span className="eyebrow">Your workday</span>
              <h3>Booking summary</h3>
            </div>
            <div className="s-body">
              {([
                ["Booking", product.name],
                ["Date", win?.date ?? choice.date],
                ["Time", win ? timeRange(win) : "Choose a time"],
                [isPass ? "People" : "Room", isPass ? `${choice.people} · any shared desk` : product.name],
                ...(shown?.lines ?? []).map((l): [string, ReactNode] => [
                  l.qty > 1 || product.kind === "room" ? `${l.label} × ${l.qty}` : l.label,
                  rupees(l.amountMinor),
                ]),
                ["GST (18%)", shown ? rupees(shown.taxMinor) : "—"],
              ] as [string, ReactNode][]).map(([k, v]) => (
                <div className="s-line" key={k}>
                  <span className="sk">{k}</span>
                  <span className="sv">{v}</span>
                </div>
              ))}
            </div>
            <div className="s-total">
              <span className="tk">{quote ? "Total" : "Estimate"}</span>
              <span className="tv">{shown ? rupees(shown.totalMinor) : "—"}</span>
            </div>
            <p className="summary-note">
              Prices are from the Collabix tariff, including 18% GST. Pay
              securely online to confirm.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
