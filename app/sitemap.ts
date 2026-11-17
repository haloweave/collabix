import type { MetadataRoute } from "next";
import { offerings, offeringHref } from "@/lib/offerings";
import { SITE_ORIGIN } from "@/lib/site";

// Public, indexable pages only. Admin, staff, account, tickets and the payment
// return page are kept out here and disallowed in robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_ORIGIN}${path}`,
    changeFrequency: "weekly",
    priority,
  });
  return [
    page("/", 1),
    page("/pricing", 0.9),
    page("/book", 0.9),
    page("/book/passes", 0.8),
    page("/amenities", 0.7),
    ...offerings.map((o) => page(offeringHref(o), 0.7)),
  ];
}
