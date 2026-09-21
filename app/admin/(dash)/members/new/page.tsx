import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/admin/auth";
import { Button } from "@/components/ui/button";
import { MemberForm } from "@/components/admin/member-form";

export const dynamic = "force-dynamic";

export default async function NewMemberPage() {
  await requireStaff();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/members" aria-label="Back to members">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New member</h1>
      </div>
      <MemberForm />
    </div>
  );
}
