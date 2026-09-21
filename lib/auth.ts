import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { db } from "./db/client";
import * as authSchema from "./db/auth-schema";
import { sendEmail } from "./email";

// Passwordless auth: email OTP / magic link + phone SMS OTP.
// Dev transport logs the OTP to the server console. Before launch, wire
// sendVerificationOTP to transactional email (in the proposal) and sendOTP to
// an SMS provider (NOT in the proposal — an added cost; see /home/proposal).
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
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
      async sendOTP({ phoneNumber, code }) {
        console.log(`[sms-otp] code for ${phoneNumber}: ${code}`);
      },
    }),
  ],
});
