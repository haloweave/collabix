import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Collabix Admin",
  robots: { index: false, follow: false },
};

// Guardless outer shell. It only establishes the neutral shadcn surface
// (`.admin-scope`) and a single toaster for the whole panel, so the public
// /admin/login page renders on the same surface without triggering the staff
// guard. Access control lives in the nested (dash) layout.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-scope min-h-screen">
      {children}
      <Toaster />
    </div>
  );
}
