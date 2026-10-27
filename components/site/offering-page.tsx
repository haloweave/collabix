import Image from "next/image";
import { OfferingIcon } from "@/components/site/offering-icon";
import { offeringGroups, offeringHref, offerings, type Offering } from "@/lib/offerings";

const check = "M5 13l4 4L19 7";
const mail = (o: Offering) => `mailto:connect@collabix.co.in?subject=${encodeURIComponent(`Enquiry: ${o.title}`)}`;

function Ctas({ o, light = false }: { o: Offering; light?: boolean }) {
  const ghost = light ? "btn-ghost-light" : "btn-ghost";
  return o.book
    ? <><a className="btn btn-gold" href={o.book}>Book now <span className="arw">→</span></a><a className={`btn ${ghost}`} href={mail(o)}>Email us</a></>
    : <><a className="btn btn-gold" href="tel:+919632771444">Call +91 96327 71444 <span className="arw">→</span></a><a className={`btn ${ghost}`} href={mail(o)}>Email us</a></>;
}

export default function OfferingPage({ o }: { o: Offering }) {
  const group = offeringGroups.find((g) => g.id === o.group)!;
  const related = offerings.filter((x) => x.group === o.group && x.slug !== o.slug);
  return <>
    <section className="page-hero grid-texture">
      <div className="glow"></div>
      <div className="grid-texture"></div>
      <div className="wrap">
        <span className="eyebrow">{group.label} · {o.kicker}</span>
        <h1>{o.headline}</h1>
        <p className="lead">{o.lead}</p>
        <div className="hero-cta of-cta"><Ctas o={o} light /></div>
      </div>
    </section>

    <section className="pad section-ivory">
      <div className="wrap">
        <div className={`of-intro ${o.photo ? "" : "no-photo"}`}>
          {o.photo && <div className="of-photo"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 45vw" src={o.photo.src} alt={o.photo.alt} /></div>}
          <div>
            <div className="sec-head">
              <span className="eyebrow">What you get</span>
              <h2 className="section-title"><span className="thin">{o.title}</span> at Collabix.</h2>
            </div>
            <div className="feat-list of-feats">
              {o.highlights.map((h) => (
                <div key={h.title} className="feat"><span className="ic"><OfferingIcon d={check} /></span>
                  <div><h4>{h.title}</h4><p>{h.text}</p></div></div>
              ))}
            </div>
          </div>
        </div>

        <div className="of-ask">
          <h2>Pricing</h2>
          <p>Contact us to know the price. Call <a href="tel:+919632771444">+91 96327 71444</a> or write to <a href={mail(o)}>connect@collabix.co.in</a>.</p>
        </div>
      </div>
    </section>

    <section className="pad-sm cta-band grid-texture">
      <div className="grid-texture"></div>
      <div className="wrap">
        <div className="inner">
          <h2>{o.book ? <>Reserve your {o.title.toLowerCase()} at <span className="gold-line">Collabix</span>.</> : <>Talk to us about <span className="gold-line">{o.title}</span>.</>}</h2>
          <div className="of-cta"><Ctas o={o} light /></div>
        </div>
      </div>
    </section>

    {related.length > 0 && (
      <section className="pad section-ivory-dark">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">More {group.label.toLowerCase()}</span>
          </div>
          <div className="of-related">
            {related.map((r) => (
              <a key={r.slug} className="of-related-card" href={offeringHref(r)}>
                <span className="ic"><OfferingIcon d={r.icon} /></span>
                <h3>{r.title}</h3>
                <p>{r.blurb}</p>
                <span className="link-arw">Learn more <span className="arw">→</span></span>
              </a>
            ))}
          </div>
        </div>
      </section>
    )}
  </>;
}
