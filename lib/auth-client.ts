import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// Browser-side Better Auth client. Only the email-OTP flow is needed for the
// admin panel sign-in (the customer booking flow talks to the phone-OTP
// endpoints directly). Same-origin, so no baseURL is required.
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
