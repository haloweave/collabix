import type { Metadata } from "next";
import Booking from "./booking";
export const metadata: Metadata = { title: "Collabix · Book a space" };
export default async function Page({searchParams}: {searchParams: Promise<{space?: string}>}) {
 const {space}=await searchParams;
 return <><section className="page-hero"><div className="wrap"><span className="eyebrow">Your next great workday</span><h1>A space, just for you.</h1><p className="lead">Real-time availability and booking. We hold your spot and confirm it with a one-time code — no payment is collected in this preview.</p></div></section><Booking initialSpace={space}/></>;
}
