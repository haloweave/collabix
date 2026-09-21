import type { Metadata } from "next";
import { requireStaff } from "@/lib/admin/auth";
import { StaffNav } from "@/components/admin/staff-nav";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Collabix Staff",
  robots: { index: false, follow: false },
};

// Standalone front-desk console for reception/staff. Its own light shell (no
// admin sidebar). requireStaff admits reception, staff, manager and owner.
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  return (
    <div className="admin-scope min-h-screen">
      <StaffNav />
      <main className="mx-auto max-w-5xl p-4 md:p-6">{children}</main>
      <Toaster />
    </div>
  );
}
