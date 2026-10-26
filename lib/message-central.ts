// Message Central VerifyNow: they generate, text and check the one-time code
// under their own DLT registration, so Collabix needs none. Two calls: send
// (returns a verificationId) and validateOtp (checks the code against it).

import { toIndianMobile } from "./sms";

const BASE = "https://cpaas.messagecentral.com/verification/v3";
const OTP_LENGTH = 6;

type Creds = { customerId?: string; authToken?: string; fetchImpl?: typeof fetch };

function credentials(opts: Creds) {
  const customerId = opts.customerId ?? process.env.MESSAGECENTRAL_CUSTOMER_ID ?? "";
  const authToken = opts.authToken ?? process.env.MESSAGECENTRAL_AUTH_TOKEN ?? "";
  return { customerId, authToken, fetchImpl: opts.fetchImpl ?? fetch };
}

export function messageCentralConfigured(): boolean {
  return Boolean(process.env.MESSAGECENTRAL_CUSTOMER_ID && process.env.MESSAGECENTRAL_AUTH_TOKEN);
}

/** Texts a code to an Indian mobile; returns the id to validate it against. */
export async function sendVerification(phone: string, opts: Creds = {}): Promise<string> {
  const mobile = toIndianMobile(phone);
  if (!mobile) throw new Error("invalid_phone");
  const { customerId, authToken, fetchImpl } = credentials(opts);
  const query = new URLSearchParams({
    countryCode: "91",
    customerId,
    flowType: "SMS",
    mobileNumber: mobile,
    otpLength: String(OTP_LENGTH),
  });
  const res = await fetchImpl(`${BASE}/send?${query}`, { method: "POST", headers: { authToken } });
  const data = (await res.json().catch(() => null)) as
    | { responseCode?: number; message?: string; data?: { verificationId?: string | number } }
    | null;
  const id = data?.data?.verificationId;
  if (!res.ok || data?.responseCode !== 200 || id == null) {
    throw new Error(`otp_send_failed: ${data?.message ?? res.status}`);
  }
  return String(id);
}

/** True only when Message Central confirms the code; wrong or expired codes are false. */
export async function validateVerification(verificationId: string, code: string, opts: Creds = {}): Promise<boolean> {
  const { authToken, fetchImpl } = credentials(opts);
  const query = new URLSearchParams({ verificationId, code, flowType: "SMS" });
  const res = await fetchImpl(`${BASE}/validateOtp?${query}`, { method: "GET", headers: { authToken } });
  const data = (await res.json().catch(() => null)) as
    | { responseCode?: number; data?: { verificationStatus?: string } }
    | null;
  return data?.responseCode === 200 && data.data?.verificationStatus === "VERIFICATION_COMPLETED";
}
