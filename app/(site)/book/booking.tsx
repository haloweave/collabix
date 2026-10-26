"use client";
import { useEffect, useState, type ReactNode } from "react";
import { spaces, money } from "@/lib/spaces";
import { autoAssignDesks } from "@/lib/floorplan";
import { MAX_DURATION, PRESET_DURATIONS, TAX_RATE } from "@/lib/domain/booking";
import FloorMap from "./floor-map";

type Slot = { resourceId: string; code: string; available: boolean };
type Quote = { subtotalMinor: number; taxMinor: number; totalMinor: number };
type SpaceKey = (typeof spaces)[number]["key"];

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// The next whole hour in IST, so the default slot is never already in the past.
// Rolls to 00:00 tomorrow late at night.
function nextSlot(): { date: string; hour: number } {
  const ist = new Date(Date.now() + 330 * 60_000);
  const hour = ist.getUTCHours() + 1;
  if (hour < 24) return { date: localDate(), hour };
  return { date: new Date(ist.getTime() + 3_600_000).toISOString().slice(0, 10), hour: 0 };
}

// "22:00–4:00 IST (next day)" — bookings may run past midnight.
function timeRange(hour: number, duration: number) {
  const end = hour + duration;
  if (end === 24) return `${hour}:00–midnight IST`;
  return `${hour}:00–${end % 24}:00 IST${end > 24 ? " (next day)" : ""}`;
}

const rupees = (minor: number) => money(Math.round(minor / 100));

// Steps: Book(0) · Details(1) · Verify(2) · Pay(3) · Done(4)
const STEPS = ["Book", "Details", "Verify", "Pay", "Done"];

// How long we keep asking the server about a payment Cashfree hasn't settled
// yet (the webhook or the bank can lag the modal closing by a few seconds).
const SETTLE_RETRIES = 5;
const SETTLE_DELAY_MS = 2000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Booking({ initialSpace }: { initialSpace?: string }) {
  const [key, setKey] = useState(
    spaces.find((s) => s.key === initialSpace)?.key ?? "hotdesk",
  );
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(() => nextSlot().date);
  const [hour, setHour] = useState(() => nextSlot().hour);
  const [duration, setDuration] = useState(8);
  // "Custom" reveals an hours picker for durations the preset buttons don't cover.
  const [customDuration, setCustomDuration] = useState(false);
  const [seatCount, setSeatCount] = useState(1);
  const [autoAssign, setAutoAssign] = useState(true);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCodes, setConfirmedCodes] = useState<string[] | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  // Pay step: what the button is doing right now, for its label.
  const [payPhase, setPayPhase] = useState<"idle" | "opening" | "confirming">("idle");
  // Live hourly rates (whole rupees) keyed by plan key, lazy-loaded from the DB
  // after the page renders so the first paint isn't blocked on a query.
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) setRates(data as Record<string, number>);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const space = spaces.find((s) => s.key === key)!;
  // Advertised prices come only from the live DB rates (/api/rates); until they
  // load, spaceRate is null and the UI shows a blurry placeholder rather than a
  // stale hardcoded number.
  const spaceRate = rates?.[key] ?? null;
  const isDesk = space.desk;
  const label = STEPS[step];

  // Blurry skeleton shown in place of a price while rates load.
  const rateSkel = <span className="rate-skel" aria-hidden="true" />;

  const availableCount = slots.filter((s) => s.available).length;
  const codeById = new Map(slots.map((s) => [s.resourceId, s.code]));

  // Auto-selection is derived, not stored: when the toggle is on we cluster
  // `seatCount` available desks, or take the first free room, live off the
  // current slots. Manual picks live in manualIds. Cheap enough to recompute
  // each render (~4 dozen seats), so no memo needed.
  const freeSlots = slots.filter((s) => s.available);
  const autoIds = !autoAssign
    ? []
    : isDesk
      ? autoAssignDesks(freeSlots.map((s) => s.code), seatCount)
          .map((c) => slots.find((s) => s.code === c)?.resourceId)
          .filter((id): id is string => Boolean(id))
      : freeSlots.slice(0, 1).map((s) => s.resourceId);

  const selectedIds = autoAssign ? autoIds : manualIds;
  // With a single room of this kind there is nothing to choose, so neither the
  // auto-select toggle nor the floor plan is offered.
  const canChoose = isDesk || slots.length > 1;
  const showMap = canChoose && !autoAssign;
  const selectedCodes = selectedIds
    .map((id) => codeById.get(id))
    .filter((c): c is string => Boolean(c));
  // Seats that drive the price: how many the guest has actually selected, or
  // (before any selection) the auto target, so the estimate is never zero.
  const priceSeats = isDesk ? selectedIds.length || seatCount : 1;

  const windowValid =
    date !== "" && date >= localDate();

  const phoneE164 =
    phone.replace(/\D/g, "").length === 10
      ? `+91${phone.replace(/\D/g, "")}`
      : phone.trim();

  // Live availability: refetch whenever the space or window changes on the
  // Book step. Selection is cleared by the controls that change the window.
  useEffect(() => {
    if (step !== 0 || !windowValid) return;
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const r = await fetch(
          `/api/availability?plan=${key}&date=${date}&start=${hour}&duration=${duration}`,
        );
        const d = await r.json();
        if (!cancelled) setSlots(r.ok ? d.resources : []);
      } catch {
        if (!cancelled) {
          setSlots([]);
          setError("Could not load availability. Please try again.");
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, key, date, hour, duration, windowValid]);

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
    label === "Book" && windowValid && selectedIds.length >= 1;

  function pickSpace(nextKey: SpaceKey) {
    setKey(nextKey);
    setManualIds([]);
    setSeatCount(1);
    setAutoAssign(true);
    setSlots([]);
  }

  function resetSelection() {
    setManualIds([]);
    setAutoAssign(true);
  }

  function pickDuration(d: number) {
    setDuration(d);
    resetSelection();
  }

  // A tap on the floor plan. Rooms: single-select one room. Desks: switch to
  // manual and toggle the seat, seeding from whatever was auto-selected so the
  // auto picks are taken into consideration.
  function selectSeat(resourceId: string) {
    if (!isDesk) {
      setManualIds((prev) => (prev[0] === resourceId ? [] : [resourceId]));
      return;
    }
    if (autoAssign) {
      const base = autoIds.includes(resourceId)
        ? autoIds.filter((id) => id !== resourceId)
        : [...autoIds, resourceId];
      setManualIds(base);
      setAutoAssign(false);
      return;
    }
    setManualIds((prev) =>
      prev.includes(resourceId)
        ? prev.filter((id) => id !== resourceId)
        : [...prev, resourceId],
    );
  }

  function changeSeatCount(next: number) {
    const clamped = Math.max(1, Math.min(next, availableCount || 1));
    setSeatCount(clamped);
    setAutoAssign(true); // bumping the count means "auto-pick this many"
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || selectedIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planKey: key,
          resourceIds: selectedIds,
          date,
          start: hour,
          duration,
          customerName: name.trim(),
          customerEmail: email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "seat_unavailable"
            ? "One of those spots was just taken. Please pick again."
            : "We couldn't hold your spots. Please check your details.",
        );
        if (data.error === "seat_unavailable") {
          resetSelection();
          setStep(0);
        }
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
          setError("Couldn't load the payment window. Please try again.");
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
      setError("Something went wrong with the payment window. Please try again.");
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
      setConfirmedCodes(selectedCodes);
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
        setError("That seat was taken while you paid. We'll refund you in full — please pick another seat.");
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
    setDate(localDate());
    setSeatCount(1);
    setAutoAssign(true);
    setManualIds([]);
    setName("");
    setEmail("");
    setPhone("");
    setSlots([]);
    setBookingId(null);
    setHoldExpiresAt(null);
    setQuote(null);
    setOtp("");
    setError(null);
    setConfirmedCodes(null);
    setTicketToken(null);
    setPayPhase("idle");
  }

  const spotSummary = isDesk
    ? selectedCodes.length
      ? `${selectedCodes.length} desk${selectedCodes.length > 1 ? "s" : ""} · ${selectedCodes.join(", ")}`
      : "Choose your desks"
    : selectedCodes[0] ?? "Choose a room";

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
                <h2>Pick your space, time and seats.</h2>

                <span className="filter-label">Space</span>
                <div className="space-pills">
                  {spaces.map((s) => (
                    <button
                      key={s.key}
                      className={`pill ${key === s.key ? "sel" : ""}`}
                      aria-pressed={key === s.key}
                      onClick={() => pickSpace(s.key)}
                    >
                      <span className="pn">{s.name}</span>
                      <span className="pd">{s.blurb}</span>
                      <span className="pp">
                        from{" "}
                        {rates && rates[s.key] != null ? (
                          money(rates[s.key])
                        ) : (
                          <span className="rate-skel" aria-hidden="true" />
                        )}
                        <span className="per">/hr</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="booking-when">
                  <div className="field">
                    <label htmlFor="booking-date">Date · Bengaluru time</label>
                    <input
                      id="booking-date"
                      type="date"
                      min={localDate()}
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        resetSelection();
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="booking-time">Start time</label>
                    <select
                      id="booking-time"
                      value={hour}
                      onChange={(e) => {
                        setHour(Number(e.target.value));
                        resetSelection();
                      }}
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map(
                        (h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}:00
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                <span className="filter-label">Duration</span>
                <div className="dur-toggle">
                  {PRESET_DURATIONS.map((d) => (
                    <button
                      key={d}
                      className={!customDuration && duration === d ? "sel" : ""}
                      aria-pressed={!customDuration && duration === d}
                      onClick={() => {
                        setCustomDuration(false);
                        pickDuration(d);
                      }}
                    >
                      {d} {d === 1 ? "hour" : "hours"}
                    </button>
                  ))}
                  <button
                    className={customDuration ? "sel" : ""}
                    aria-pressed={customDuration}
                    onClick={() => setCustomDuration(true)}
                  >
                    Custom
                  </button>
                </div>
                {customDuration && (
                  <div className="field dur-custom">
                    <label htmlFor="booking-hours">Hours</label>
                    <select
                      id="booking-hours"
                      value={duration}
                      onChange={(e) => pickDuration(Number(e.target.value))}
                    >
                      {Array.from({ length: MAX_DURATION }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {h} {h === 1 ? "hour" : "hours"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isDesk && (
                  <div className="seats-control">
                    <div className="seats-count">
                      <span className="filter-label">Seats</span>
                      <div className="stepper" role="group" aria-label="Number of seats">
                        <button
                          type="button"
                          aria-label="One fewer seat"
                          disabled={seatCount <= 1 || !autoAssign}
                          onClick={() => changeSeatCount(seatCount - 1)}
                        >
                          −
                        </button>
                        <span className="stepper-val" aria-live="polite">
                          {autoAssign ? seatCount : selectedIds.length}
                        </span>
                        <button
                          type="button"
                          aria-label="One more seat"
                          disabled={
                            !autoAssign || seatCount >= (availableCount || 1)
                          }
                          onClick={() => changeSeatCount(seatCount + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <label className="auto-toggle">
                      <input
                        type="checkbox"
                        checked={autoAssign}
                        onChange={(e) => setAutoAssign(e.target.checked)}
                      />
                      <span>Auto-select seats</span>
                    </label>
                  </div>
                )}

                {!isDesk && canChoose && (
                  <div className="seats-control">
                    <label className="auto-toggle">
                      <input
                        type="checkbox"
                        checked={autoAssign}
                        onChange={(e) => {
                          setAutoAssign(e.target.checked);
                          setManualIds([]);
                        }}
                      />
                      <span>Auto-select a room</span>
                    </label>
                  </div>
                )}

                <div className="booking-avail">
                  {!windowValid ? (
                    <p className="avail-hint">Pick a date to see live availability.</p>
                  ) : loadingSlots ? (
                    <p className="avail-hint">Checking live availability…</p>
                  ) : slots.length === 0 ? (
                    <p className="avail-hint">
                      No spots free for this window. Try another time.
                    </p>
                  ) : !showMap ? (
                    // Auto-select hides the floor plan (the summary shows the
                    // pick); unticking it reveals the map to choose by hand.
                    !selectedCodes.length && (
                      <p aria-live="polite" className="avail-hint">
                        No {isDesk ? "seats" : "rooms"} free for this window. Try another time.
                      </p>
                    )
                  ) : (
                    <>
                      <span className="filter-label">
                        Live floor plan · {isDesk ? "tap seats to select" : "tap a room"}
                      </span>
                      <FloorMap
                        slots={slots}
                        selectedResourceIds={selectedIds}
                        onSelect={selectSeat}
                        priceLabel={spaceRate != null ? `${money(spaceRate)}/hr` : undefined}
                      />
                      <p aria-live="polite" className="avail-hint">
                        {selectedCodes.length
                          ? `Selected: ${selectedCodes.join(", ")}`
                          : "Select an available spot to continue."}
                      </p>
                    </>
                  )}
                </div>
              </>
            )}

            {label === "Details" && (
              <>
                <h2>Your workday, at a glance.</h2>
                <p>
                  We&#39;ll hold your{" "}
                  {selectedCodes.length > 1 ? "spots" : "spot"} and send a
                  one-time code to your phone to confirm — no password needed.
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
                      {busy ? "Holding your spot…" : "Hold & send code →"}
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
                    {selectedCodes.length > 1 ? "Spots held" : "Spot held"} for{" "}
                    <strong>{mmss}</strong>
                  </p>
                ) : (
                  <p className="hold-timer expired">Your hold has expired.</p>
                )}
                <p>
                  We sent a 6-digit code to {phoneE164}. (In local dev, the code
                  prints to the server console.)
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
                    {selectedCodes.length > 1 ? "Spots held" : "Spot held"} for{" "}
                    <strong>{mmss}</strong>
                  </p>
                ) : (
                  <p className="hold-timer expired">Your hold has expired.</p>
                )}
                <p>
                  Your number is verified. Pay securely and your{" "}
                  {selectedCodes.length > 1 ? "seats are" : "seat is"} confirmed the
                  moment the bank says yes — your e-ticket arrives by email.
                </p>
                <div className="confirm-details">
                  <p>
                    {space.name}
                    {selectedCodes.length ? ` · ${selectedCodes.join(", ")}` : ""}
                  </p>
                  <p>
                    {date} · {timeRange(hour, duration)}
                  </p>
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
                  Thanks, {name}. Your{" "}
                  {confirmedCodes && confirmedCodes.length > 1
                    ? "spots are"
                    : "spot is"}{" "}
                  confirmed and your account is set up — next time, just verify
                  your number to book.
                </p>
                <div className="confirm-details">
                  <p>
                    {space.name}
                    {confirmedCodes && confirmedCodes.length
                      ? ` · ${confirmedCodes.join(", ")}`
                      : ""}
                  </p>
                  <p>
                    {date} · {timeRange(hour, duration)}
                  </p>
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
                ["Space", space.name],
                ["Date", date || "Choose a date"],
                ["Time", timeRange(hour, duration)],
                ["Spot", spotSummary],
                [
                  "Subtotal",
                  quote
                    ? rupees(quote.subtotalMinor)
                    : spaceRate != null
                      ? money(spaceRate * duration * priceSeats)
                      : rateSkel,
                ],
                [
                  "Tax (18%)",
                  quote
                    ? rupees(quote.taxMinor)
                    : spaceRate != null
                      ? money(Math.round(spaceRate * duration * priceSeats * TAX_RATE))
                      : rateSkel,
                ],
              ] as [string, ReactNode][]).map(([k, v]) => (
                <div className="s-line" key={k}>
                  <span className="sk">{k}</span>
                  <span className="sv">{v}</span>
                </div>
              ))}
            </div>
            <div className="s-total">
              <span className="tk">Estimate</span>
              <span className="tv">
                {quote
                  ? rupees(quote.totalMinor)
                  : spaceRate != null
                    ? money(
                        spaceRate * duration * priceSeats +
                          Math.round(spaceRate * duration * priceSeats * TAX_RATE),
                      )
                    : rateSkel}
              </span>
            </div>
            <p className="summary-note">
              Availability and totals are live. Pay securely online to confirm
              your seat.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
