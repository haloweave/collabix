import type { Metadata } from "next";
import Link from "next/link";
import SiteShell from "@/components/site/site-shell";
import { OfferingIcon } from "@/components/site/offering-icon";
import { offeringHref, offerings } from "@/lib/offerings";
import "./(site)/home.css";

export const metadata: Metadata = { title: "Collabix · Page not found" };

const popular = ["hot-desk", "meeting-rooms", "day-pass", "gst-accounting"].map((slug) => offerings.find((o) => o.slug === slug)!);

/** Site-wide 404: unmatched URLs and notFound() from the marketing pages. */
export default function NotFound() {
  return <SiteShell>
    <section className="page-hero grid-texture nf-hero">
      <div className="glow"></div>
      <div className="grid-texture"></div>
      <div className="wrap">
        <span className="eyebrow">Error 404 · Page not found</span>
        <div className="nf-code" aria-hidden="true">4<span>0</span>4</div>
        <h1>This room doesn&#39;t exist.</h1>
        <p className="lead">The page you were looking for has moved, or the link is mistyped. Everything else at Collabix is right where you left it.</p>
        <div className="hero-cta nf-cta">
          <Link className="btn btn-gold" href="/">Back to home <span className="arw">→</span></Link>
          <a className="btn btn-ghost-light" href="/booking">Book a Space</a>
        </div>
      </div>
    </section>

    <section className="pad-sm section-ivory">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Popular at Collabix</span>
        </div>
        <div className="of-related">
          {popular.map((o) => (
            <a key={o.slug} className="of-related-card" href={offeringHref(o)}>
              <span className="ic"><OfferingIcon d={o.icon} /></span>
              <h3>{o.title}</h3>
              <p>{o.blurb}</p>
              <span className="link-arw">Learn more <span className="arw">→</span></span>
            </a>
          ))}
        </div>
      </div>
    </section>
  </SiteShell>;
}
