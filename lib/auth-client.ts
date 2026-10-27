import { createAuthClient } from "better-auth/react";
import { emailOTPClient, phoneNumberClient } from "better-auth/client/plugins";

// Browser-side Better Auth client. The email-OTP flow is for the admin panel
// sign-in; the phone-number plugin types the session user's verified mobile
// (the customer booking flow still talks to the phone-OTP endpoints directly).
// Same-origin, so no baseURL is required.
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), phoneNumberClient()],
});
