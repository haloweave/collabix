"use client";
import { useEffect, useState, type ReactNode } from "react";
import { money } from "@/lib/tariff";
import { authClient } from "@/lib/auth-client";

// The checkout every /book flow shares once something is chosen: details,
// phone OTP, Cashfree payment and the confirmation. Each flow supplies its own
// Book step and the hold request; holding, paying and confirming are the same
// booking/payment machinery underneath.

export type QuoteLine = { label: string; qty: number; unitMinor: number; amountMinor: number };
export type Quote = { lines: QuoteLine[]; subtotalMinor: number; taxMinor: number; totalMinor: number };

// Steps: Book(0) · Details(1) · Verify(2) · Pay(3) · Done(4)
export const STEPS = ["Book", "Details", "Verify", "Pay", "Done"];

// Exact amount: "₹471" when whole, "₹470.82" otherwise — never rounded away
// from what is charged.
export const rupees = (minor: number) =>
  minor % 100 === 0
    ? money(minor / 100)
    : `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// How long we keep asking the server about a payment Cashfree hasn't settled
// yet (the webhook or the bank can lag the modal closing by a few seconds).
const SETTLE_RETRIES = 5;
const SETTLE_DELAY_MS = 2000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Checkout = ReturnType<typeof useCheckout>;

/** The signed-in customer's details, as far as we know them. Accounts made by
 * a phone sign-in start with the number as their name and a placeholder email,
 * so those count as unknown. `phone` is set only once the number is verified. */
export type Account = { name: string; email: string; phone: string | null };

type SessionUser = {
  name: string;
  email: string;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean | null;
};

function accountFrom(user: SessionUser | undefined): Account | null {
  if (!user) return null;
  const phone = user.phoneNumberVerified && user.phoneNumber ? user.phoneNumber : null;
  return {
    name: user.name === user.phoneNumber ? "" : user.name,
    email: user.email.endsWith("@phone.collabix.local") ? "" : user.email,
    phone,
  };
}

export function useCheckout() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  // Seconds the hold had when it was taken: the full turn of the timer ring.
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  // Pay step: what the button is doing right now, for its label.
  const [payPhase, setPayPhase] = useState<"idle" | "opening" | "confirming">("idle");
  const { data: session } = authClient.useSession();
  const account = accountFrom(session?.user);

  const phoneE164 =
    phone.replace(/\D/g, "").length === 10
      ? `+91${phone.replace(/\D/g, "")}`
      : phone.trim();

  // Live hold countdown on the Verify and Pay steps.
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

  /** Move between steps. Reaching Details fills in whatever the signed-in
   * account already knows, without overwriting anything typed. */
  function goTo(next: number) {
    if (next === 1 && account) {
      setName((v) => v || account.name);
      setEmail((v) => v || account.email);
      setPhone((v) => v || (account.phone ?? ""));
    }
    setStep(next);
  }

  /** True when the number on the form is the signed-in account's verified one,
   * so there is nothing left to prove by SMS. */
  const phoneVerified = !!account?.phone && account.phone === phoneE164;

  /** POST the flow's hold request; on success move to Verify and send the
   * code, or straight to Pay when the number is already verified. A refusal
   * returns the server's error code for the flow to explain. */
  async function hold(url: string, body: object): Promise<{ ok: true } | { ok: false; error: string }> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "invalid" };
      setBookingId(data.bookingId);
      setHoldExpiresAt(data.holdExpiresAt);
      setHoldSeconds(Math.max(1, Math.round((new Date(data.holdExpiresAt).getTime() - Date.now()) / 1000)));
      setQuote(data.quote);
      if (phoneVerified) {
        setStep(3); // Pay
        return { ok: true };
      }
      setStep(2); // Verify
      await sendOtp();
      return { ok: true };
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
    if (r.status === 429) setError("Too many codes requested. Please wait a few minutes and try again.");
    else if (!r.ok) setError("Could not send the code. Check the mobile number.");
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

  function reset() {
    setStep(0);
    setName("");
    setEmail("");
    setPhone("");
    setBookingId(null);
    setHoldExpiresAt(null);
    setHoldSeconds(0);
    setQuote(null);
    setOtp("");
    setError(null);
    setTicketToken(null);
    setPayPhase("idle");
  }

  return {
    step,
    setStep: goTo,
    account,
    phoneVerified,
    name,
    setName,
    email,
    setEmail,
    phone,
    setPhone,
    phoneE164,
    holdExpiresAt,
    holdSeconds,
    quote,
    otp,
    setOtp,
    busy,
    error,
    setError,
    ticketToken,
    payPhase,
    remaining,
    mmss,
    hold,
    sendOtp,
    verifyOtp,
    startPayment,
    reset,
  };
}

export function BookingProgress({ step }: { step: number }) {
  return (
    <ol className="booking-progress" aria-label="Booking progress">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? "step" : undefined}
          className={i === step ? "current" : i < step ? "done" : ""}
        >
          <span>{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

/** The quiet countdown while a seat is held: a gold ring that drains with the
 * hold, and what to do before it runs out. `holding` names the thing held,
 * e.g. "your desk". */
function HoldTimer({ co, holding }: { co: Checkout; holding: string }) {
  const { remaining, mmss, holdSeconds } = co;
  const r = 15;
  const circ = 2 * Math.PI * r;
  const left = holdSeconds > 0 ? Math.min(1, remaining / holdSeconds) : 0;
  const expired = !co.holdExpiresAt || remaining === 0;
  const tone = expired ? "expired" : remaining <= 120 ? "low" : "";
  return (
    <div className={`hold-timer ${tone}`}>
      <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
        <circle className="track" cx="18" cy="18" r={r} />
        <circle
          className="ring"
          cx="18"
          cy="18"
          r={r}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - left)}
        />
      </svg>
      {expired ? (
        <div className="ht-text" role="status">
          <strong>Your hold has ended.</strong>
          <span>Start over to pick your dates again.</span>
        </div>
      ) : (
        <>
          <div className="ht-text">
            <strong>Holding {holding}</strong>
            <span>Complete payment to confirm it.</span>
          </div>
          <span className="ht-time" role="timer" aria-label={`${Math.ceil(remaining / 60)} minutes left`}>
            {mmss}
          </span>
        </>
      )}
    </div>
  );
}

/** Steps 2–5: Details, Verify, Pay and Done. `details` is what was booked,
 * shown on the Pay and Done steps. */
export function CheckoutSteps({
  co,
  onSubmitDetails,
  holding,
  details,
  onRestart,
}: {
  co: Checkout;
  onSubmitDetails: (e: React.FormEvent) => void;
  holding: string;
  details: ReactNode;
  onRestart: () => void;
}) {
  const label = STEPS[co.step];
  const { quote, remaining, busy, payPhase, account } = co;
  // A signed-in customer whose account has everything sees who they're
  // booking as instead of the form, unless they choose to edit it.
  const [editing, setEditing] = useState(false);
  const known =
    !!account?.name && !!account.email && !!account.phone && co.phoneVerified &&
    co.name === account.name && co.email === account.email;
  const timer = <HoldTimer co={co} holding={holding} />;

  return (
    <>
      {label === "Details" && known && !editing && (
        <>
          <form onSubmit={onSubmitDetails}>
            <div className="confirm-details booking-as">
              <div>
                <p>
                  <strong>{co.name}</strong>
                </p>
                <p>{co.email}</p>
                <p>{co.phoneE164}</p>
              </div>
              <button type="button" className="link-btn" onClick={() => setEditing(true)}>
                Edit
              </button>
            </div>
            <div className="step-actions">
              <button className="btn btn-outline" type="button" onClick={() => co.setStep(0)}>
                ← Back
              </button>
              <button className="btn btn-gold" type="submit" disabled={busy}>
                {busy ? "One moment…" : "Continue to pay →"}
              </button>
            </div>
          </form>
        </>
      )}

      {label === "Details" && !(known && !editing) && (
        <>
          <h2>Your workday, at a glance.</h2>
          {co.phoneVerified ? (
            <p>You&#39;re signed in, so there&#39;s no code to enter.</p>
          ) : (
            <p>
              We&#39;ll hold your booking and send a one-time code to your
              phone to confirm — no password needed.
            </p>
          )}
          <form onSubmit={onSubmitDetails}>
            <div className="field">
              <label htmlFor="booking-name">Full name</label>
              <input
                id="booking-name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                value={co.name}
                onChange={(e) => co.setName(e.target.value)}
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
                value={co.email}
                onChange={(e) => co.setEmail(e.target.value)}
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
                value={co.phone}
                onChange={(e) => co.setPhone(e.target.value)}
              />
            </div>
            <div className="step-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => co.setStep(0)}
              >
                ← Back
              </button>
              <button
                className="btn btn-gold"
                type="submit"
                disabled={
                  busy ||
                  co.name.trim().length < 2 ||
                  co.phone.replace(/\D/g, "").length < 10
                }
              >
                {co.phoneVerified
                  ? busy
                    ? "One moment…"
                    : "Continue to pay →"
                  : busy
                    ? "Sending code…"
                    : "Send code →"}
              </button>
            </div>
          </form>
        </>
      )}

      {label === "Verify" && (
        <>
          <h2>Confirm it&#39;s you.</h2>
          {timer}
          <p>
            We sent a 6-digit code to {co.phoneE164}. It expires in 1 minute —
            tap Resend code if it runs out.
          </p>
          <form onSubmit={co.verifyOtp}>
            <div className="field">
              <label htmlFor="booking-otp">One-time code</label>
              <input
                id="booking-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="otp-input"
                value={co.otp}
                onChange={(e) => co.setOtp(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="step-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={co.sendOtp}
                disabled={busy}
              >
                Resend code
              </button>
              <button
                className="btn btn-gold"
                type="submit"
                disabled={busy || co.otp.length < 4 || remaining === 0}
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
          {timer}
          <p>
            Your booking is confirmed the moment the bank says yes, and your
            e-ticket arrives by email.
          </p>
          <div className="confirm-details">
            {details}
            {quote && <p>Total to pay: {rupees(quote.totalMinor)}</p>}
          </div>
          <div className="step-actions">
            <button
              className="btn btn-outline"
              type="button"
              onClick={onRestart}
              disabled={busy}
            >
              Start over
            </button>
            <button
              className="btn btn-gold"
              type="button"
              onClick={co.startPayment}
              disabled={busy || remaining === 0 || !quote}
            >
              {payPhase === "opening"
                ? "Opening secure checkout…"
                : payPhase === "confirming"
                  ? "Confirming your payment…"
                  : quote
                    ? `Pay ${rupees(quote.totalMinor)} →`
                    : "Pay →"}
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
            {account
              ? `Thanks, ${co.name}. Your booking is confirmed and saved to your account.`
              : `Thanks, ${co.name}. Your booking is confirmed and your account is set up — next time, just verify your number to book.`}
          </p>
          <div className="confirm-details">
            {details}
            <p>{co.email}</p>
            {quote && <p>Total paid: {rupees(quote.totalMinor)}</p>}
          </div>
          {co.ticketToken && (
            <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered SVG QR */}
              <img
                src={`/t/${co.ticketToken}/qr.svg`}
                alt="Your booking QR code"
                width={200}
                height={200}
                style={{ margin: "0 auto", background: "#fff", padding: 8, borderRadius: 12 }}
              />
              <p style={{ fontSize: ".85rem", marginTop: ".5rem" }}>
                Show this QR at reception to check in. We&#39;ve emailed it to you too.
              </p>
              <a className="btn btn-gold" href={`/t/${co.ticketToken}`} style={{ marginTop: ".75rem" }}>
                View ticket <span className="arw">→</span>
              </a>
            </div>
          )}
          <button
            className="btn btn-outline"
            onClick={onRestart}
            style={{ marginTop: "1rem" }}
          >
            Book another
          </button>
        </div>
      )}
    </>
  );
}

/** The navy summary card beside every step. On phones it is a slim total
 * bar pinned above the tab bar, opening to the full breakdown on tap. */
export function BookingSummary({
  rows,
  shown,
  final,
}: {
  rows: [string, ReactNode][];
  /** The held quote, or an on-device estimate before the hold. */
  shown: Quote | null;
  final: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={`summary ${open ? "open" : ""}`} aria-label="Booking summary">
      <div className="s-head">
        <span className="eyebrow">Your workday</span>
        <h3>Booking summary</h3>
      </div>
      <div className="s-body" id="summary-breakdown">
        {[...rows, ["GST (18%)", shown ? rupees(shown.taxMinor) : "—"] as [string, ReactNode]].map(([k, v]) => (
          <div className="s-line" key={k}>
            <span className="sk">{k}</span>
            <span className="sv">{v}</span>
          </div>
        ))}
      </div>
      <div className="s-total">
        <span className="tk">{final ? "Total" : "Estimate"}</span>
        <span className="tv">{shown ? rupees(shown.totalMinor) : "—"}</span>
        <button
          type="button"
          className="s-toggle"
          aria-expanded={open}
          aria-controls="summary-breakdown"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "Details"}
          <span aria-hidden="true">{open ? "▾" : "▴"}</span>
        </button>
      </div>
      <p className="summary-note">
        Prices are from the Collabix tariff, including 18% GST. Pay
        securely online to confirm.
      </p>
    </aside>
  );
}
