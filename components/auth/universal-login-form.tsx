"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { classifyIdentifier, dashboardFor, type LoginIdentifier } from "@/lib/auth/login-routing";

// One sign-in for members and staff. An email runs the email-OTP flow, a
// mobile number the SMS-OTP flow (the same one checkout uses). After the code
// is accepted we read the session's role and go to that person's dashboard.
export function UniversalLoginForm() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [id, setId] = useState<LoginIdentifier | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const parsed = classifyIdentifier(raw);
    if (!parsed) {
      toast.error("Enter your email address or 10-digit mobile number.");
      return;
    }
    setBusy(true);
    try {
      if (parsed.kind === "email") {
        const { error } = await authClient.emailOtp.sendVerificationOtp({ email: parsed.value, type: "sign-in" });
        if (error) throw new Error(error.message ?? "Could not send the code.");
      } else {
        const r = await fetch("/api/auth/phone-number/send-otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phoneNumber: parsed.value }),
        });
        if (!r.ok) throw new Error("Could not send the code. Check the number.");
      }
      setId(parsed);
      toast.success(parsed.kind === "email" ? "Code sent. Check your email." : "Code sent by SMS.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!id || code.trim().length < 4) return;
    setBusy(true);
    try {
      if (id.kind === "email") {
        const { error } = await authClient.signIn.emailOtp({ email: id.value, otp: code.trim() });
        if (error) throw new Error(error.message ?? "That code didn't match.");
      } else {
        const r = await fetch("/api/auth/phone-number/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phoneNumber: id.value, code: code.trim() }),
        });
        if (!r.ok) throw new Error("That code didn't match. Please try again.");
      }
      const { data } = await authClient.getSession();
      const role = (data?.user as { role?: string } | undefined)?.role;
      router.push(dashboardFor(role));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign you in.");
      setBusy(false);
    }
  }

  if (!id) {
    return (
      <form onSubmit={sendCode} className="login-form">
        <div className="login-field">
          <label htmlFor="login-id" className="login-label">
            Email or mobile number
          </label>
          <input
            id="login-id"
            className="login-input"
            autoComplete="username"
            inputMode="email"
            placeholder="you@example.com or 98765 43210"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
          />
        </div>
        <button type="submit" className="login-submit" disabled={busy || !raw.trim()}>
          {busy ? "Sending code…" : <>Send code <span className="arw">→</span></>}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="login-form">
      <div className="login-field">
        <label htmlFor="login-code" className="login-label">
          One-time code sent to {id.value}
        </label>
        <input
          id="login-code"
          className="login-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
      </div>
      <button type="submit" className="login-submit" disabled={busy || code.length < 4}>
        {busy ? "Signing in…" : <>Verify &amp; sign in <span className="arw">→</span></>}
      </button>
      <p className="login-hint">
        <button type="button" onClick={() => { setId(null); setCode(""); }} style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
          Use a different email or number
        </button>
      </p>
    </form>
  );
}
