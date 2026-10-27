import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { db } from "./db/client";
import * as authSchema from "./db/auth-schema";
import { sendEmail } from "./email";
import { sendOtpSms, toIndianMobile } from "./sms";
import { messageCentralConfigured, sendVerification, validateVerification } from "./message-central";

const mcKey = (phone: string) => `message-central:${phone}`;

// Members sign in passwordless; staff may also use an email + password.
// Sign-in and checkout verify a mobile number by SMS code:
// Message Central VerifyNow when configured (lib/message-central.ts), else
// Fast2SMS (lib/sms.ts). The email-OTP plugin stays for staff tooling but the
// public login offers mobile codes and staff passwords only.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  // Email + password sign-in for staff accounts only. Nobody can sign up with a
  // password: credentials are created by the seed script (lib/db/seed-login.ts).
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Every code is a paid SMS: at most 3 send requests per address per 10 minutes.
  rateLimit: {
    customRules: { "/phone-number/send-otp": { window: 600, max: 3 } },
  },
  user: {
    additionalFields: {
      // Surfaced on the session user so route guards can gate /admin. `input:
      // false` stops clients from granting themselves a role at sign-up; roles
      // are assigned by staff or the owner-seed script only.
      role: {
        type: "string",
        required: false,
        defaultValue: "member",
        input: false,
      },
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        // Real email when SMTP is configured; console fallback otherwise.
        await sendEmail({
          to: email,
          subject: `Your Collabix verification code: ${otp}`,
          text: `Your Collabix verification code is ${otp}.\n\nIt expires shortly. If you didn't request this, you can ignore this email.`,
        });
      },
    }),
    phoneNumber({
      // Create/lookup an account once a phone number is verified.
      signUpOnVerification: {
        getTempEmail: (phone) => `${phone}@phone.collabix.local`,
        getTempName: (phone) => phone,
      },
      // Indian mobiles only: anything else is refused before an SMS is paid for.
      phoneNumberValidator: (phone) => toIndianMobile(phone) !== null,
      ...(messageCentralConfigured()
        ? {
            // Message Central generates, texts and checks the code under its own
            // DLT registration. Its verificationId is kept in Better Auth's
            // verification table between the send and the check.
            async sendOTP({ phoneNumber }, ctx) {
              const verificationId = await sendVerification(phoneNumber);
              const adapter = ctx!.context.internalAdapter;
              await adapter.deleteVerificationByIdentifier(mcKey(phoneNumber));
              await adapter.createVerificationValue({
                identifier: mcKey(phoneNumber),
                value: verificationId,
                expiresAt: new Date(Date.now() + 10 * 60_000),
              });
            },
            async verifyOTP({ phoneNumber, code }, ctx) {
              const adapter = ctx!.context.internalAdapter;
              const row = await adapter.findVerificationValue(mcKey(phoneNumber));
              if (!row || row.expiresAt < new Date()) return false;
              const ok = await validateVerification(row.value, code);
              if (ok) await adapter.deleteVerificationByIdentifier(mcKey(phoneNumber));
              return ok;
            },
          }
        : {
            // Fallback: Better Auth's own code, delivered by Fast2SMS.
            async sendOTP({ phoneNumber, code }) {
              await sendOtpSms(phoneNumber, code);
            },
          }),
    }),
  ],
});
