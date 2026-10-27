"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { classifyIdentifier, dashboardFor, type LoginIdentifier } from "@/lib/auth/login-routing";

// One sign-in for members and staff. A mobile number gets an SMS code (the
// same flow checkout uses); an email reveals a password field for staff
// accounts. Once signed in we read the session's role and go to that person's
// dashboard.
const linkButton = { background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" } as const;

export function UniversalLoginForm() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [id, setId] = useState<LoginIdentifier | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const isEmail = raw.includes("@");

  async function goToDashboard() {
    const { data } = await authClient.getSession();
    const role = (data?.user as { role?: string } | undefined)?.role;
    router.push(dashboardFor(role));
    router.refresh();
  }

  async function requestCode(target: LoginIdentifier) {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/phone-number/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: target.value }),
      });
      if (r.status === 429) throw new Error("Too many codes requested. Please wait a few minutes and try again.");
      if (!r.ok) throw new Error("Could not send the code. Check the number.");
      setId(target);
      setCode("");
      toast.success("Code sent by SMS.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPassword(email: string) {
    setBusy(true);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      toast.error(error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Wrong email or password.");
      setBusy(false);
      return;
    }
    await goToDashboard();
  }

  async function submitFirstStep(e: React.FormEvent) {
    e.preventDefault();
    const parsed = classifyIdentifier(raw);
    if (parsed?.kind === "email") {
      if (password) await signInWithPassword(parsed.value);
      return;
    }
    if (!parsed) {
      toast.error(isEmail ? "Enter a valid email address." : "Enter your 10-digit mobile number.");
      return;
    }
    await requestCode(parsed);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!id || code.trim().length < 4) return;
    setBusy(true);
    try {
      const r = await fetch("/api/auth/phone-number/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: id.value, code: code.trim() }),
      });
      if (!r.ok) throw new Error("That code didn't match. Please try again.");
      await goToDashboard();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign you in.");
      setBusy(false);
    }
  }

  if (!id) {
    return (
      <form onSubmit={submitFirstStep} className="login-form">
        <div className="login-field">
          <label htmlFor="login-id" className="login-label">
            Mobile number or staff email
          </label>
          <input
            id="login-id"
            className="login-input"
            type="text"
            autoComplete="username"
            placeholder="98765 43210"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
          />
        </div>
        {isEmail && (
          <div className="login-field">
            <label htmlFor="login-password" className="login-label">
              Password
            </label>
            <input
              id="login-password"
              className="login-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {isEmail ? (
          <button type="submit" className="login-submit" disabled={busy || !raw.trim() || !password}>
            {busy ? "Signing in…" : <>Sign in <span className="arw">→</span></>}
          </button>
        ) : (
          <button type="submit" className="login-submit" disabled={busy || !raw.trim()}>
            {busy ? "Sending code…" : <>Send code <span className="arw">→</span></>}
          </button>
        )}
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
      <p className="login-hint">The code expires in 1 minute.</p>
      <p className="login-hint">
        <button type="button" disabled={busy} onClick={() => void requestCode(id)} style={linkButton}>
          Resend code
        </button>
        {" · "}
        <button type="button" onClick={() => { setId(null); setCode(""); }} style={linkButton}>
          Use a different number
        </button>
      </p>
    </form>
  );
}
