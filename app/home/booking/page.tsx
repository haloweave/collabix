import type { Metadata } from "next";
import Booking from "./booking";
export const metadata: Metadata = { title: "Collabix · Book a space" };
export default async function Page({searchParams}: {searchParams: Promise<{space?: string}>}) {
 const {space}=await searchParams;
 return <><section className="page-hero"><div className="wrap"><span className="eyebrow">Your next great workday</span><h1>A space, just for you.</h1><p className="lead">Explore the booking experience. Availability is illustrative; no reservation or payment is made.</p></div></section><Booking initialSpace={space}/></>;
}
