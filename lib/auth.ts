import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { db } from "./db/client";
import * as authSchema from "./db/auth-schema";
import { sendEmail } from "./email";
import { sendOtpSms, toIndianMobile } from "./sms";

// Passwordless auth. Sign-in and checkout verify a mobile number by SMS code
// (Fast2SMS, lib/sms.ts). The email-OTP plugin stays for staff tooling but the
// public login only offers mobile.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
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
      async sendOTP({ phoneNumber, code }) {
        await sendOtpSms(phoneNumber, code);
      },
    }),
  ],
});
