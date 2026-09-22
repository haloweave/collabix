import { requireMember } from "@/lib/account/auth";
import { AccountShell } from "@/components/account/account-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await requireMember();
  return <AccountShell name={member.name}>{children}</AccountShell>;
}
