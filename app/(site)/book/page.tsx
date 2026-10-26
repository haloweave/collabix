import type { Metadata } from "next";
import Booking from "./booking";
export const metadata: Metadata = { title: "Collabix · Book a space" };
// ?product=<tariff product key>; the old ?space=meeting link maps to the 4-seater room.
export default async function Page({searchParams}: {searchParams: Promise<{product?: string; space?: string}>}) {
 const {product, space}=await searchParams;
 return <Booking initialProduct={product ?? (space === "meeting" ? "meeting-4" : undefined)}/>;
}
