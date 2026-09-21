import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/account/auth";
import { MemberLoginForm } from "@/components/account/member-login-form";

export const dynamic = "force-dynamic";

export default async function AccountLoginPage() {
  if (await getMemberSession()) redirect("/account");
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <MemberLoginForm />
    </div>
  );
}
