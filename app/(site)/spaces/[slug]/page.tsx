import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OfferingPage from "@/components/site/offering-page";
import { findOffering, offerings } from "@/lib/offerings";

export const dynamicParams = false;

export function generateStaticParams() {
  return offerings.filter((o) => o.group !== "services").map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const o = findOffering("spaces", (await params).slug);
  return o ? { title: `Collabix · ${o.title}`, description: o.lead } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const o = findOffering("spaces", (await params).slug);
  if (!o) notFound();
  return <OfferingPage o={o} />;
}
