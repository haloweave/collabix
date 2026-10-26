import type { Metadata } from "next";
import SiteShell from "@/components/site/site-shell";
import { getSessionUser } from "@/lib/admin/auth";
import "./home.css";
export const metadata: Metadata = {
 title: "Collabix · Work Lounge",
 description: "Explore hot desks, dedicated desks, private cabins and meeting rooms at Collabix, Bengaluru.",
 openGraph: { title: "Collabix · Work Lounge", description: "A premium managed work lounge in Bengaluru. Where serious work happens." },
};
export default async function Layout({children}: {children: React.ReactNode}) {
 // Auth-aware header: "Login" for visitors, "My account" for anyone signed in
 // (/login forwards a signed-in user to their own dashboard).
 const authed = Boolean(await getSessionUser());
 return <SiteShell authed={authed}>{children}</SiteShell>;
}
