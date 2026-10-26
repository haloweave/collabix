import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/admin/auth";
import { dashboardFor } from "@/lib/auth/login-routing";
import { UniversalLoginForm } from "@/components/auth/universal-login-form";
import { Toaster } from "@/components/ui/sonner";
import "../(site)/home.css";
import "./login.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Collabix · Sign in",
  robots: { index: false, follow: false },
};

// The one sign-in page. Anyone already signed in is sent straight to their own
// dashboard (member portal, staff console or admin panel) by role.
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(dashboardFor(user.role));

  return (
    <div className="login-scene">
      <aside className="login-aside">
        <div className="login-aside__photo" />
        <div className="login-aside__scrim" />
        <div className="login-aside__grid" />

        <div className="login-aside__brand login-reveal">
          <Link href="/" className="login-aside__logo" aria-label="Collabix home">
            <Image width={3088} height={852} priority src="/collabix/img/logo-white.png" alt="Collabix — Work Lounge" />
          </Link>
          <Link href="/" className="login-aside__back">
            ← Back to site
          </Link>
        </div>

        <div className="login-aside__body">
          <span className="login-eyebrow login-reveal d1">Collabix Work Lounge</span>
          <h1 className="login-aside__title login-reveal d2">
            Your work lounge,
            <br />
            <em>whenever</em> you need it.
          </h1>
          <p className="login-aside__sub login-reveal d3">
            Members see their bookings, tickets and invoices. Staff land in the front-desk console or the admin panel.
          </p>
          <div className="login-meta login-reveal d4">
            <div>
              <div className="k">24·7</div>
              <div className="l">Member access</div>
            </div>
            <div>
              <div className="k">1-tap</div>
              <div className="l">Book again</div>
            </div>
            <div>
              <div className="k">GST</div>
              <div className="l">Invoices ready</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-card login-reveal d2">
          <span className="login-eyebrow">Welcome back</span>
          <h2 className="login-card__title">Sign in</h2>
          <p className="login-card__desc">
            Enter the email or mobile number on your account. We&#39;ll send a one-time code — no password needed.
          </p>

          <UniversalLoginForm />

          {process.env.NODE_ENV !== "production" && (
            <p className="login-hint">Local dev: the code prints to the server console.</p>
          )}
          <p className="login-legal">
            New to Collabix? <Link href="/book">Book a space</Link> — your account is created automatically at checkout.
          </p>
        </div>
      </main>
      <Toaster />
    </div>
  );
}
