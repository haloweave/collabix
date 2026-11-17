import { requireMember } from "@/lib/account/auth";
import { getBillingProfile } from "@/lib/account/billing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "@/components/account/profile-form";
import { BillingForm } from "@/components/account/billing-form";
import { DocumentPanel } from "@/components/documents/document-panel";
import { toDocumentItem } from "@/lib/document-item";
import { db } from "@/lib/db/client";
import { kycStatusOf, listDocuments } from "@/lib/domain/documents";
import { KYC_LABEL } from "@/lib/document-labels";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const member = await requireMember();
  const [billing, docs] = await Promise.all([getBillingProfile(member.id), listDocuments(db, member.id)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Profile</h1>
        <p className="text-sm text-navy/60">Your account, billing details and ID.</p>
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
      <Card>
        <CardHeader>
          <CardTitle>Business details for invoices</CardTitle>
          <CardDescription>
            Booking for a company? Add its GSTIN and we&apos;ll print it on your
            tax invoices so you can claim the GST back.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingForm initial={billing} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ID documents</CardTitle>
          <CardDescription>
            Upload a government ID (Aadhaar, PAN, passport…) so we can verify
            your membership. Only you and Collabix staff can see it. Status:{" "}
            {KYC_LABEL[kycStatusOf(docs)]}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentPanel
            mode="member"
            docs={docs.map(toDocumentItem)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
