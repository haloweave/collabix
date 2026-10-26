// SMS delivery for one-time codes, via Fast2SMS. Better Auth generates and
// checks the code; this only delivers it. Quick SMS (route=q) needs no DLT
// registration; once a DLT template is approved this can move to the cheaper
// DLT route without touching callers. With no FAST2SMS_API_KEY, development
// logs the code to the server console and production refuses.

const ENDPOINT = "https://www.fast2sms.com/dev/bulkV2";

/** "9876543210" for an Indian mobile in any common format, else null. */
export function toIndianMobile(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

export function otpMessage(code: string): string {
  return `${code} is your Collabix verification code. It expires in 5 minutes. Do not share it with anyone.`;
}

export async function sendOtpSms(
  phone: string,
  code: string,
  opts: { apiKey?: string; fetchImpl?: typeof fetch; production?: boolean } = {},
): Promise<void> {
  const apiKey = opts.apiKey ?? process.env.FAST2SMS_API_KEY ?? "";
  const production = opts.production ?? process.env.NODE_ENV === "production";
  const mobile = toIndianMobile(phone);
  if (!mobile) throw new Error("invalid_phone");

  if (!apiKey) {
    if (production) throw new Error("sms_not_configured");
    console.log(`[sms:dev] code for ${phone}: ${code}`);
    return;
  }

  const res = await (opts.fetchImpl ?? fetch)(ENDPOINT, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ route: "q", message: otpMessage(code), numbers: mobile }),
  });
  const data = (await res.json().catch(() => null)) as { return?: boolean; message?: unknown } | null;
  if (!res.ok || !data?.return) {
    throw new Error(`sms_failed: ${JSON.stringify(data?.message ?? res.status)}`);
  }
}
