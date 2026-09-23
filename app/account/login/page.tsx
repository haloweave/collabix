import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/account/auth";
import { MemberLoginForm } from "@/components/account/member-login-form";
import "./login.css";

export const dynamic = "force-dynamic";

export default async function AccountLoginPage() {
  if (await getMemberSession()) redirect("/account");
  return (
    <div className="login-scene">
      <aside className="login-aside">
        <div className="login-aside__photo" />
        <div className="login-aside__scrim" />
        <div className="login-aside__grid" />

        <div className="login-aside__brand login-reveal">
          <Link href="/" className="login-aside__logo" aria-label="Collabix home">
            <Image
              width={3088}
              height={852}
              priority
              src="/collabix/img/logo-white.png"
              alt="Collabix — Work Lounge"
            />
          </Link>
          <Link href="/" className="login-aside__back">
            ← Back to site
          </Link>
        </div>

        <div className="login-aside__body">
          <span className="login-eyebrow login-reveal d1">Member access</span>
          <h1 className="login-aside__title login-reveal d2">
            Your work lounge,
            <br />
            <em>whenever</em> you need it.
          </h1>
          <p className="login-aside__sub login-reveal d3">
            Sign in to view your bookings, download invoices and reserve your next
            desk in a tap.
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
            Enter your phone number to see your bookings and invoices.
          </p>

          <MemberLoginForm />

          <p className="login-hint">Demo — any number works, no OTP needed.</p>
          <p className="login-legal">
            New to Collabix? <Link href="/booking">Book a space</Link> — your
            account is created automatically at checkout.
          </p>
        </div>
      </main>
    </div>
  );
}
