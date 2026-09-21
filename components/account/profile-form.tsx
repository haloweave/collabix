"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOwnProfile } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProfileForm({ name: initial }: { name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          toast.error("Enter a name.");
          return;
        }
        startTransition(async () => {
          await updateOwnProfile(name);
          toast.success("Profile updated.");
          router.refresh();
        });
      }}
      className="grid max-w-sm gap-3"
    >
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">Name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <Button type="submit" disabled={pending || name === initial}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
