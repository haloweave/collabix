import type { Metadata } from "next";
import SiteShell from "@/components/site/site-shell";
import "./home.css";
export const metadata: Metadata = {
 title: "Collabix · Work Lounge",
 description: "Explore hot desks, dedicated desks, private cabins and meeting rooms at Collabix, Bengaluru.",
 openGraph: { title: "Collabix · Work Lounge", description: "A premium managed work lounge in Bengaluru. Where serious work happens." },
};
// No session read here: touching cookies would make every marketing page
// dynamic. SiteShell works out "Login" vs "My account" in the browser.
export default function Layout({children}: {children: React.ReactNode}) {
 return <SiteShell>{children}</SiteShell>;
}
