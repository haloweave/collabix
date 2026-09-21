import { requireStaff } from "@/lib/admin/auth";
import { AppSidebar } from "@/components/admin/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

// Guarded shell for every operational admin page. requireStaff() redirects
// anonymous or non-staff visitors before any page renders.
export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium text-muted-foreground">
            Collabix · Admin
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
