"use client";
import { useEffect, useState } from "react";
import { spaces, money } from "@/lib/spaces";

type Slot = { resourceId: string; code: string; available: boolean };
type Quote = { subtotalMinor: number; taxMinor: number; totalMinor: number };

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const rupees = (minor: number) => money(Math.round(minor / 100));

// Steps: Space(0) · Date & seat(1) · Details(2) · Verify(3) · Done(4)
const STEPS = ["Space", "Date & seat", "Details", "Verify", "Done"];

export default function Booking({ initialSpace }: { initialSpace?: string }) {
  const [key, setKey] = useState(
    spaces.find((s) => s.key === initialSpace)?.key ?? "hotdesk",
  );
  const [step, setStep] = useState(0);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState(8);
  const [duration, setDuration] = useState(8);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);

  const space = spaces.find((s) => s.key === key)!;
  const label = STEPS[step];
  const selected = slots.find((s) => s.resourceId === resourceId);

  const windowValid =
    date !== "" && date >= localDate() && hour + duration <= 20;

  const phoneE164 =
    phone.replace(/\D/g, "").length === 10
      ? `+91${phone.replace(/\D/g, "")}`
      : phone.trim();

  // Live availability: refetch whenever the space or window changes on the
  // combined step. Selection is cleared by the controls that change the window.
  useEffect(() => {
    if (step !== 1 || !windowValid) return;
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
    label === "Space" ||
    (label === "Date & seat" && windowValid && selected?.available === true);

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !resourceId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planKey: key,
          resourceId,
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
            ? "That spot was just taken. Please pick another."
            : "We couldn't hold that spot. Please check your details.",
        );
        if (data.error === "seat_unavailable") setStep(1);
        return;
      }
      setReservationId(data.reservationId);
      setHoldExpiresAt(data.holdExpiresAt);
      setQuote(data.quote);
      setStep(3); // Verify
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
    if (otp.trim().length < 4 || !reservationId) return;
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
        body: JSON.stringify({ reservationId }),
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
      setConfirmedCode(selected?.code ?? null);
      setStep(4); // Done
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setStep(0);
    setDate("");
    setResourceId(null);
    setName("");
    setEmail("");
    setPhone("");
    setSlots([]);
    setReservationId(null);
    setHoldExpiresAt(null);
    setQuote(null);
    setOtp("");
    setError(null);
    setConfirmedCode(null);
  }

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

            {label === "Space" && (
              <>
                <h2>Choose your space.</h2>
                <div className="booking-options">
                  {spaces.map((s) => (
                    <button
                      className={`opt ${key === s.key ? "sel" : ""}`}
                      key={s.key}
                      aria-pressed={key === s.key}
                      onClick={() => {
                        setKey(s.key);
                        setResourceId(null);
                        setSlots([]);
                      }}
                    >
                      <span className="oinfo">
                        <span className="on">{s.name}</span>
                        <span className="od">{s.description}</span>
                      </span>
                      <span className="oprice">
                        <span className="amt">{money(s.rate)}</span>
                        <span className="per"> / hour</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {label === "Date & seat" && (
              <>
                <h2>Pick your time, see live spots.</h2>
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
                        setResourceId(null);
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
                        setResourceId(null);
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
                        setResourceId(null);
                      }}
                    >
                      {d === 8 ? "Full day" : `${d} ${d === 1 ? "hour" : "hours"}`}
                    </button>
                  ))}
                </div>

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
                        {space.desk ? "Open-plan desks" : "Rooms"} · live
                      </span>
                      <div className={space.desk ? "floor-bank" : "room-choices"}>
                        <div className={space.desk ? "floor-seats" : "room-grid"}>
                          {slots.map((s) => (
                            <button
                              key={s.resourceId}
                              disabled={!s.available}
                              aria-pressed={resourceId === s.resourceId}
                              aria-label={`${s.code}${s.available ? "" : ", unavailable"}`}
                              className={resourceId === s.resourceId ? "selected" : ""}
                              onClick={() =>
                                setResourceId(
                                  resourceId === s.resourceId ? null : s.resourceId,
                                )
                              }
                            >
                              {space.desk ? s.code.replace("D-", "") : s.code}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p aria-live="polite" className="avail-hint">
                        {selected
                          ? `Selected: ${selected.code}`
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
                  We&#39;ll hold your spot and send a one-time code to your phone
                  to confirm — no password needed.
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
                      onClick={() => setStep(1)}
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
                    Spot held for <strong>{mmss}</strong>
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
                  Thanks, {name}. Your spot is confirmed and your account is set
                  up — next time, just verify your number to book.
                </p>
                <div className="confirm-details">
                  <p>
                    {space.name}
                    {confirmedCode ? ` · ${confirmedCode}` : ""}
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

            {(label === "Space" || label === "Date & seat") && (
              <div className="step-actions">
                <button
                  className="btn btn-outline"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  ← Back
                </button>
                <button
                  className="btn btn-gold"
                  disabled={!canContinue}
                  onClick={() => setStep(step + 1)}
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
                ["Spot", selected ? selected.code : "Choose a spot"],
                [
                  "Subtotal",
                  quote ? rupees(quote.subtotalMinor) : money(space.rate * duration),
                ],
                [
                  "Tax (18%)",
                  quote
                    ? rupees(quote.taxMinor)
                    : money(Math.round(space.rate * duration * 0.18)),
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
                      space.rate * duration +
                        Math.round(space.rate * duration * 0.18),
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
