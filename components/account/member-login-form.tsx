"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { demoMemberLogin } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function MemberLoginForm() {
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Enter a phone number.");
      return;
    }
    startTransition(() => demoMemberLogin(phone));
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Enter your phone number to see your bookings. (Demo: any number works —
          no code needed.)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3">
          <Input
            inputMode="tel"
            placeholder="+91 98765 00001"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
