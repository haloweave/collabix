"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  signInVisitor,
  signOutVisitor,
} from "@/app/admin/(dash)/reception/actions";

export function VisitorSignIn() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [host, setHost] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Enter the visitor's name.");
      return;
    }
    startTransition(async () => {
      const res = await signInVisitor({ name, company, host, phone });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Visitor signed in.");
      setName("");
      setCompany("");
      setHost("");
      setPhone("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
      <Input
        placeholder="Visitor name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />
      <Input
        placeholder="Host (who they're visiting)"
        value={host}
        onChange={(e) => setHost(e.target.value)}
      />
      <Input
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in visitor"}
        </Button>
      </div>
    </form>
  );
}

export function VisitorSignOutButton({
  id,
  signedOut,
}: {
  id: string;
  signedOut: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (signedOut) return <Badge variant="outline">Signed out</Badge>;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await signOutVisitor(id);
            toast.success("Visitor signed out.");
            router.refresh();
          } catch {
            toast.error("Could not sign out visitor.");
          }
        })
      }
    >
      Sign out
    </Button>
  );
}
