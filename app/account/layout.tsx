import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Collabix · My account",
  robots: { index: false, follow: false },
};

// Guardless outer shell so /account/login renders on the same neutral surface
// without the member guard. Access control lives in the (portal) layout.
export default function AccountLayout({
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
