import { requireMember } from "@/lib/account/auth";
import { PortalNav } from "@/components/account/portal-nav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await requireMember();
  return (
    <>
      <PortalNav name={member.name} />
      <main className="mx-auto max-w-3xl p-4 md:p-6">{children}</main>
    </>
  );
}
