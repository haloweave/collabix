import type { Metadata } from "next";
import { cookies } from "next/headers";
import SiteShell from "@/components/site/site-shell";
import { MEMBER_COOKIE } from "@/lib/account/auth";
import "./home.css";
export const metadata: Metadata = {
 title: "Collabix · Work Lounge",
 description: "Explore hot desks, dedicated desks, private cabins and meeting rooms at Collabix, Banaswadi, Bengaluru.",
 robots: { index: false, follow: false },
 openGraph: { title: "Collabix · Work Lounge", description: "Explore the Collabix Work Lounge preview." },
};
export default async function Layout({children}: {children: React.ReactNode}) {
 // Auth-aware header: swap the Login CTA for an Account link when a member
 // session cookie is present. Presence is enough here — the portal itself
 // re-validates against the DB.
 const authed = Boolean((await cookies()).get(MEMBER_COOKIE)?.value);
 return <SiteShell authed={authed}>{children}</SiteShell>;
}
