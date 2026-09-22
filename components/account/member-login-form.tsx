"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { demoMemberLogin } from "@/app/account/actions";

export function MemberLoginForm() {
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Enter a phone number.");
      return;
    }
    startTransition(() => demoMemberLogin(phone));
  }

  return (
    <form onSubmit={submit} className="login-form">
      <div className="login-field">
        <label htmlFor="member-phone" className="login-label">
          Phone number
        </label>
        <input
          id="member-phone"
          className="login-input"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+91 98765 00001"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <button type="submit" className="login-submit" disabled={pending}>
        {pending ? (
          "Signing in…"
        ) : (
          <>
            Continue <span className="arw">→</span>
          </>
        )}
      </button>
    </form>
  );
}
