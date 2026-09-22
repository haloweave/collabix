import type { Metadata } from "next";
import SiteShell from "@/components/site/site-shell";
import "./home.css";
export const metadata: Metadata = {
 title: "Collabix · Work Lounge",
 description: "Explore hot desks, dedicated desks, private cabins and meeting rooms at Collabix, Banaswadi, Bengaluru.",
 robots: { index: false, follow: false },
 openGraph: { title: "Collabix · Work Lounge", description: "Explore the Collabix Work Lounge preview." },
};
export default function Layout({children}: {children: React.ReactNode}) { return <SiteShell>{children}</SiteShell>; }
