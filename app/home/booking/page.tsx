import type { Metadata } from "next";
import Booking from "./booking";
export const metadata: Metadata = { title: "Collabix · Book a space" };
export default async function Page({searchParams}: {searchParams: Promise<{space?: string}>}) {
 const {space}=await searchParams;
 return <Booking initialSpace={space}/>;
}
