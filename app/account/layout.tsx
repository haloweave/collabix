import type { Metadata } from "next";
import "../home/home.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Collabix · My account",
  robots: { index: false, follow: false },
};

// Customer-facing shell — uses the Collabix brand styling (home.css), not the
// admin surface. The brand `body` (navy) shows through; pages provide their own
// `.collabix-site` wrapper (login) or the AccountShell (portal).
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
