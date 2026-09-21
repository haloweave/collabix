import { requireMember } from "@/lib/account/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "@/components/account/profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const member = await requireMember();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account details.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProfileForm name={member.name} />
          <div className="grid gap-1 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{member.phone ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{member.email}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
