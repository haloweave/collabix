import { requireAdminAccess } from "@/lib/admin/auth";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// Guarded shell for every operational admin page. requireAdminAccess() redirects
// anonymous/non-staff visitors, and sends the reception role to /staff.
export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminAccess();

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <AdminTopbar />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
