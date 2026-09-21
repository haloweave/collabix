"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createMember } from "@/app/admin/(dash)/members/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Roles a staff member can assign at creation. Manager/owner are granted later
// via the role editor (manager-gated).
const CREATE_ROLES = [
  { value: "member", label: "Member" },
  { value: "reception", label: "Reception" },
  { value: "staff", label: "Staff" },
];

export function MemberForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("member");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    startTransition(async () => {
      const res = await createMember({ name, email, phone, role, notes });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Member created.");
      router.push(`/admin/members/${res.id}`);
    });
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>New member</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Name *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Email *</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Phone</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Role</span>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create member"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
