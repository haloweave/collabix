// Firebase Phone Auth, server side. The browser texts and checks the code with
// Firebase (lib/phone-otp-client.ts) and hands us the resulting ID token in
// place of the SMS code; this checks it is genuine, for our project, for the
// same mobile, and fresh. Google signs these tokens with public keys, so no
// service account or secret is needed — only the project id.

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from "jose";
import { toIndianMobile } from "./sms";

const GOOGLE_JWKS = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);
const remoteJwks = createRemoteJWKSet(GOOGLE_JWKS);

/** How long after the Firebase sign-in the token may be exchanged for a session. */
const MAX_AGE_SEC = 10 * 60;

type Opts = { projectId?: string; jwks?: JWTVerifyGetKey; now?: Date };

export function firebasePhoneConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}

/** A Firebase ID token is a three-part JWT; an SMS code is a few digits. */
export function looksLikeFirebaseToken(code: string): boolean {
  if (code.split(".").length !== 3 || code.length < 100) return false;
  try {
    return decodeProtectedHeader(code).alg === "RS256";
  } catch {
    return false;
  }
}

/** True only for a fresh Firebase phone sign-in of the same Indian mobile. */
export async function verifyFirebasePhoneToken(token: string, phone: string, opts: Opts = {}): Promise<boolean> {
  const projectId = opts.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  if (!projectId) return false;
  try {
    const { payload } = await jwtVerify(token, opts.jwks ?? remoteJwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
      currentDate: opts.now,
    });
    const firebase = payload.firebase as { sign_in_provider?: string } | undefined;
    if (firebase?.sign_in_provider !== "phone") return false;
    const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
    const authTime = typeof payload.auth_time === "number" ? payload.auth_time : 0;
    if (now - authTime > MAX_AGE_SEC) return false;
    const claimed = typeof payload.phone_number === "string" ? toIndianMobile(payload.phone_number) : null;
    return claimed !== null && claimed === toIndianMobile(phone);
  } catch (e) {
    // Reason only (never the token), so a rejection can be diagnosed from logs.
    console.warn(`[firebase] token rejected: ${(e as Error).message}`);
    return false;
  }
}
