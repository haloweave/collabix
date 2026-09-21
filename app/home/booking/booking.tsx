"use client";
import { useEffect, useState } from "react";
import { spaces, money } from "@/lib/spaces";
import { autoAssignDesks } from "@/lib/floorplan";
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

const rupees = (minor: number) => money(Math.round(minor / 100));

// Steps: Book(0) · Details(1) · Verify(2) · Done(3)
const STEPS = ["Book", "Details", "Verify", "Done"];

export default function Booking({ initialSpace }: { initialSpace?: string }) {
  const [key, setKey] = useState(
    spaces.find((s) => s.key === initialSpace)?.key ?? "hotdesk",
  );
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(() => localDate()); // default to today (IST)
  const [hour, setHour] = useState(8);
  const [duration, setDuration] = useState(8);
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
  // Live hourly rates (whole rupees) keyed by plan key, lazy-loaded from the DB
  // after the page renders so the first paint isn't blocked on a query. Until it
  // resolves we show the static indicative rate from lib/spaces.ts.
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
  const spaceRate = rates?.[key] ?? space.rate;
  const isDesk = space.desk;
  const label = STEPS[step];

  const availableCount = slots.filter((s) => s.available).length;
  const codeById = new Map(slots.map((s) => [s.resourceId, s.code]));

  // Auto-selection is derived, not stored: when the toggle is on we cluster
  // `seatCount` available desks live off the current slots. Manual picks live
  // in manualIds. Rooms are always manual (single-select). Cheap enough to
  // recompute each render (~4 dozen seats), so no memo needed.
  const autoIds =
    isDesk && autoAssign
      ? autoAssignDesks(
          slots.filter((s) => s.available).map((s) => s.code),
          seatCount,
        )
          .map((c) => slots.find((s) => s.code === c)?.resourceId)
          .filter((id): id is string => Boolean(id))
      : [];

  const selectedIds = isDesk && autoAssign ? autoIds : manualIds;
  const selectedCodes = selectedIds
    .map((id) => codeById.get(id))
    .filter((c): c is string => Boolean(c));
  // Seats that drive the price: how many the guest has actually selected, or
  // (before any selection) the auto target, so the estimate is never zero.
  const priceSeats = isDesk ? selectedIds.length || seatCount : 1;

  const windowValid =
    date !== "" && date >= localDate() && hour + duration <= 20;

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

  async function verifyAndConfirm(e: React.FormEvent) {
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
      const c = await fetch("/api/bookings/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await c.json();
      if (!c.ok) {
        setError(
          data.error === "hold_expired"
            ? "Your hold expired. Please start again."
            : "We couldn't confirm the booking.",
        );
        return;
      }
      setConfirmedCodes(selectedCodes);
      setStep(3); // Done
    } finally {
      setBusy(false);
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
                        from {money(rates?.[s.key] ?? s.rate)}
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
                      {Array.from({ length: 13 - duration }, (_, i) => i + 8).map(
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
                  {[1, 2, 4, 8].map((d) => (
                    <button
                      key={d}
                      className={duration === d ? "sel" : ""}
                      aria-pressed={duration === d}
                      onClick={() => {
                        setDuration(d);
                        setHour(Math.min(hour, 20 - d));
                        resetSelection();
                      }}
                    >
                      {d === 8 ? "Full day" : `${d} ${d === 1 ? "hour" : "hours"}`}
                    </button>
                  ))}
                </div>

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

                <div className="booking-avail">
                  {!windowValid ? (
                    <p className="avail-hint">Pick a date to see live availability.</p>
                  ) : loadingSlots ? (
                    <p className="avail-hint">Checking live availability…</p>
                  ) : slots.length === 0 ? (
                    <p className="avail-hint">
                      No spots free for this window. Try another time.
                    </p>
                  ) : (
                    <>
                      <span className="filter-label">
                        Live floor plan ·{" "}
                        {isDesk
                          ? autoAssign
                            ? "auto-selected — tap to choose your own"
                            : "tap seats to select"
                          : "tap a room"}
                      </span>
                      <FloorMap
                        slots={slots}
                        selectedResourceIds={selectedIds}
                        onSelect={selectSeat}
                        priceLabel={`${money(spaceRate)}/hr`}
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
                <form onSubmit={verifyAndConfirm}>
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
                      {busy ? "Confirming…" : "Verify & confirm →"}
                    </button>
                  </div>
                </form>
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
                    {date} · {hour}:00–{hour + duration}:00 IST
                  </p>
                  <p>{email}</p>
                  {quote && <p>Total paid on arrival: {rupees(quote.totalMinor)}</p>}
                </div>
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
              {[
                ["Space", space.name],
                ["Date", date || "Choose a date"],
                ["Time", `${hour}:00–${hour + duration}:00 IST`],
                ["Spot", spotSummary],
                [
                  "Subtotal",
                  quote
                    ? rupees(quote.subtotalMinor)
                    : money(spaceRate * duration * priceSeats),
                ],
                [
                  "Tax (18%)",
                  quote
                    ? rupees(quote.taxMinor)
                    : money(Math.round(spaceRate * duration * priceSeats * 0.18)),
                ],
              ].map(([k, v]) => (
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
                  : money(
                      spaceRate * duration * priceSeats +
                        Math.round(spaceRate * duration * priceSeats * 0.18),
                    )}
              </span>
            </div>
            <p className="summary-note">
              Availability and totals are live. Payment is collected on arrival in
              this preview.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
