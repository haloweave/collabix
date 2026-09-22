import Image from "next/image";
import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/account/auth";
import { MemberLoginForm } from "@/components/account/member-login-form";

export const dynamic = "force-dynamic";

export default async function AccountLoginPage() {
  if (await getMemberSession()) redirect("/account");
  return (
    <div className="collabix-site flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Image
        width={3088}
        height={852}
        className="h-8 w-auto"
        src="/collabix/img/logo-white.png"
        alt="Collabix — Work Lounge"
        priority
      />
      <div className="portal-scope w-full max-w-sm">
        <MemberLoginForm />
      </div>
    </div>
  );
}
