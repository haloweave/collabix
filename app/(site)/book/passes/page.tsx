import type { Metadata } from "next";
import Passes from "./passes";
export const metadata: Metadata = { title: "Collabix · Monthly & annual passes" };
// ?plan=<term plan key> opens on that plan.
export default async function Page({searchParams}: {searchParams: Promise<{plan?: string}>}) {
 const {plan}=await searchParams;
 return <Passes initialPlan={plan}/>;
}
