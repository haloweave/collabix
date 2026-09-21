"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateMemberNotes,
  updateMemberRole,
} from "@/app/admin/(dash)/members/actions";
import { Button } from "@/components/ui/button";
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

const ALL_ROLES = ["member", "reception", "staff", "manager", "owner"];

export function MemberEditor({
  id,
  notes: initialNotes,
  role: initialRole,
  canManageRoles,
}: {
  id: string;
  notes: string;
  role: string;
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [role, setRole] = useState(initialRole);
  const [notesPending, startNotes] = useTransition();
  const [rolePending, startRole] = useTransition();

  function saveNotes() {
    startNotes(async () => {
      try {
        await updateMemberNotes(id, notes);
        toast.success("Notes saved.");
        router.refresh();
      } catch {
        toast.error("Could not save notes.");
      }
    });
  }

  function saveRole(next: string) {
    setRole(next);
    startRole(async () => {
      try {
        await updateMemberRole(id, next);
        toast.success("Role updated.");
        router.refresh();
      } catch {
        toast.error("Could not update role.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="CRM notes about this member…"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div>
            <Button
              size="sm"
              onClick={saveNotes}
              disabled={notesPending || notes === initialNotes}
            >
              {notesPending ? "Saving…" : "Save notes"}
            </Button>
          </div>
        </div>

        {canManageRoles && (
          <div className="grid gap-1.5 border-t pt-4 text-sm">
            <span className="text-muted-foreground">Role</span>
            <Select value={role} onValueChange={saveRole} disabled={rolePending}>
              <SelectTrigger className="w-48 capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
