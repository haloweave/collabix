// Shared by the universal /login page (client) and the guards (server).
// Client-safe: no server imports.

/** Where a signed-in user belongs: staff roles → /admin (reception → /staff), everyone else → /account. */
export function dashboardFor(role: string | undefined): string {
  switch (role) {
    case "owner":
    case "manager":
    case "staff":
      return "/admin";
    case "reception":
      return "/staff";
    default:
      return "/account";
  }
}

export type LoginIdentifier =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

/**
 * One field for everyone: an email picks the email-OTP flow (staff), a mobile
 * number the SMS-OTP flow (members). Indian numbers normalise to +91 E.164.
 */
export function classifyIdentifier(raw: string): LoginIdentifier | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("@")) {
    const email = s.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { kind: "email", value: email } : null;
  }
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (hasPlus) {
    return digits.length >= 11 && digits.length <= 15 ? { kind: "phone", value: `+${digits}` } : null;
  }
  if (digits.length === 10) return { kind: "phone", value: `+91${digits}` };
  if (digits.length === 11 && digits.startsWith("0")) return { kind: "phone", value: `+91${digits.slice(1)}` };
  if (digits.length === 12 && digits.startsWith("91")) return { kind: "phone", value: `+${digits}` };
  return null;
}
