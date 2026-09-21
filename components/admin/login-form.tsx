"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm({ forbidden }: { forbidden?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "sign-in",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Could not send the code.");
      return;
    }
    toast.success("Code sent. Check your email.");
    setStep("otp");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp: otp.trim(),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Invalid or expired code.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Admin sign in</CardTitle>
        <CardDescription>
          {step === "email"
            ? "Enter your staff email to receive a one-time code."
            : `We sent a 6-digit code to ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {forbidden && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            That account doesn&apos;t have admin access. Sign in with a staff
            account.
          </p>
        )}

        {step === "email" ? (
          <form onSubmit={sendCode} className="grid gap-3">
            <Input
              type="email"
              required
              placeholder="you@collabix.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="grid gap-3">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Verifying…" : "Verify & sign in"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setStep("email")}
            >
              Use a different email
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
