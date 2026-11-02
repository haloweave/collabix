// Browser side of mobile verification, shared by checkout and the login form.
//
// When Firebase is configured, Firebase texts and checks the code (behind an
// invisible reCAPTCHA) and the server receives Firebase's ID token in place of
// the code (lib/firebase-phone-token.ts). If Firebase can't send for any
// reason, it falls back to the server's own sender (Message Central), so a
// customer is never stuck. Either way the session comes from Better Auth's
// /phone-number/verify, exactly as before.

import type { ConfirmationResult } from "firebase/auth";

export type CodeResult = { ok: boolean; status: number };

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** The last code Firebase sent, for the number it was sent to. */
let pending: { phone: string; result: ConfirmationResult } | null = null;

function firebaseEnabled(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

async function firebaseAuth() {
  const { getApps, initializeApp } = await import("firebase/app");
  const { initializeAuth, getAuth, inMemoryPersistence } = await import("firebase/auth");
  const existing = getApps().find((a) => a.name === "collabix-phone");
  if (existing) return getAuth(existing);
  const app = initializeApp(firebaseConfig, "collabix-phone");
  // In memory only: the Firebase sign-in is a stepping stone to our own
  // session, so nothing is left behind in the browser's storage.
  return initializeAuth(app, { persistence: inMemoryPersistence });
}

async function firebaseSend(phone: string): Promise<ConfirmationResult> {
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
  const auth = await firebaseAuth();
  // A fresh, invisible reCAPTCHA per send; Firebase needs an element for it.
  const holder = document.createElement("div");
  holder.style.display = "none";
  document.body.appendChild(holder);
  const verifier = new RecaptchaVerifier(auth, holder, { size: "invisible" });
  try {
    return await signInWithPhoneNumber(auth, phone, verifier);
  } finally {
    verifier.clear();
    holder.remove();
  }
}

/** Text a code to an E.164 mobile (+91…). */
export async function sendPhoneCode(phone: string): Promise<CodeResult> {
  pending = null;
  if (firebaseEnabled()) {
    try {
      pending = { phone, result: await firebaseSend(phone) };
      return { ok: true, status: 200 };
    } catch (e) {
      // Error code only: falls through to the server's sender.
      console.warn("[firebase] send failed, using the fallback sender:", (e as { code?: string }).code ?? e);
    }
  }
  const r = await fetch("/api/auth/phone-number/send-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumber: phone }),
  });
  return { ok: r.ok, status: r.status };
}

/** Check the code the customer typed; on success the Better Auth session is set. */
export async function verifyPhoneCode(phone: string, code: string): Promise<CodeResult> {
  let proof = code;
  if (pending && pending.phone === phone) {
    try {
      const cred = await pending.result.confirm(code);
      proof = await cred.user.getIdToken();
      const { signOut } = await import("firebase/auth");
      await signOut(await firebaseAuth());
    } catch {
      // Wrong or expired code: let the customer retry with the same send.
      return { ok: false, status: 400 };
    }
  }
  const r = await fetch("/api/auth/phone-number/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumber: phone, code: proof }),
  });
  if (r.ok) pending = null;
  return { ok: r.ok, status: r.status };
}
