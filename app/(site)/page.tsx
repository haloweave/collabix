import Image from "next/image";
import type { Metadata } from "next";
import { money } from "@/lib/spaces";
import { tariff } from "@/lib/tariff";
export const metadata: Metadata = {title: "Collabix \u00b7 Work Lounge \u00b7 Banaswadi, Bengaluru"};
// Lowest standard price in a tariff section, for the "from ₹…" card labels.
const from = (id: string) => money(Math.min(...tariff.find((s) => s.id === id)!.rows.map((r) => r.standard)));
const planPrice = (id: string, name: string) => money(tariff.find((s) => s.id === id)!.rows.find((r) => r.name === name)!.standard);
export default function Page() { return <>


  
  

  
  <section className="hero">
    <div className="hero-bg"></div>
    <div className="hero-scrim"></div>
    <div className="wrap">
      <div className="hero-inner">
        <span className="eyebrow reveal">Work Lounge · Banaswadi, Bengaluru</span>
        <h1 className="display reveal d1">Where serious<br />work <em>happens.</em></h1>
        <p className="lead hero-sub reveal d2">A premium managed work lounge built for growth-stage founders, enterprise teams and senior professionals. Restrained. Purposeful. Ready when you are.</p>
        <div className="hero-cta reveal d3">
          <a className="btn btn-gold" href="/booking">Book a Space <span className="arw">→</span></a>
          <a className="btn btn-ghost-light" href="#spaces">Explore spaces</a>
        </div>
        <div className="hero-meta reveal d4">
          <div className="item"><div className="k">28</div><div className="l">Shared desks</div></div>
          <div className="item"><div className="k">04</div><div className="l">Private cabins</div></div>
          <div className="item"><div className="k">02</div><div className="l">Meeting rooms</div></div>
          <div className="item"><div className="k">24·7</div><div className="l">Access · Mon–Sat</div></div>
        </div>
      </div>
    </div>
    <div className="scroll-cue"><span>Scroll</span><span className="dot"></span></div>
  </section>

  
  <section className="pad section-ivory" id="spaces">
    <div className="wrap">
      <div className="sec-head reveal">
        <span className="eyebrow">01 · Choose your space</span>
        <h2 className="section-title"><span className="thin">Room for every</span> way of working.</h2>
        <p className="lead">From a flexible seat for the afternoon to a private cabin for your team — each space is finished to the same standard: warm ivory surfaces, satin-brass details, and light tuned to 2700K.</p>
      </div>
      <div className="spaces">

        <a className="space-card reveal" href="/pricing#desks">
          <div className="img"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/openoffice.jpg" alt="Open-plan hot desk area" /></div>
          <div className="body">
            <span className="kicker">Flexible · 1 person</span>
            <h3>Hot Desk</h3>
            <p>A seat in the open lounge — sit anywhere that&#39;s free, plug in and go.</p>
            <div className="price"><span className="amt">{planPrice("desks", "Hot Desk Flexi")}</span><span className="per">/ month</span>
              <span className="book">View plans <span className="arw">→</span></span></div>
          </div>
        </a>

        <a className="space-card reveal d1" href="/pricing#desks">
          <div className="img"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/desk.jpg" alt="Dedicated desk with storage" /></div>
          <div className="body">
            <span className="kicker">Reserved · 1 person</span>
            <h3>Dedicated Desk</h3>
            <p>Your own fixed seat with a locker and meeting-room credits — same spot, every day.</p>
            <div className="price"><span className="per">from</span><span className="amt">{planPrice("desks", "Dedicated Desk")}</span><span className="per">/ month</span>
              <span className="book">View plans <span className="arw">→</span></span></div>
          </div>
        </a>

        <a className="space-card reveal" href="/pricing#cabins">
          <div className="img"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/cabin.jpg" alt="Private cabin for teams" /></div>
          <div className="body">
            <span className="kicker">Private · 4 people</span>
            <h3>Private Cabin</h3>
            <p>An enclosed cabin for a team of four, with standard fit-out — ready to move in.</p>
            <div className="price"><span className="per">from</span><span className="amt">{from("cabins")}</span><span className="per">/ month</span>
              <span className="book">View plans <span className="arw">→</span></span></div>
          </div>
        </a>

        <a className="space-card reveal d1" href="/pricing#meeting">
          <div className="img"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/meeting.jpg" alt="Boardroom meeting room" /></div>
          <div className="body">
            <span className="kicker">4-seater &amp; boardroom</span>
            <h3>Meeting Rooms</h3>
            <p>A 4-seat room with TV and whiteboard, and an 8-seat boardroom with integrated VC.</p>
            <div className="price"><span className="per">from</span><span className="amt">{from("meeting")}</span><span className="per">/ hour</span>
              <span className="book">View plans <span className="arw">→</span></span></div>
          </div>
        </a>

      </div>
    </div>
  </section>

  
  <section className="pad section-navy grid-texture">
    <div className="grid-texture"></div>
    <div className="wrap">
      <div className="sec-head reveal">
        <span className="eyebrow">02 · What Collabix stands for</span>
        <h2 className="section-title">Three ideas, held together.</h2>
        <p className="lead" style={{"color": "rgba(247,245,242,.72)"}}>The name compounds <em>Collaborate</em> and <em>Matrix</em> — a network of ambitious professionals moving forward together.</p>
      </div>
      <div className="pillars reveal d1">
        <div className="pillar">
          <span className="sym">△</span>
          <span className="tag">Stability</span>
          <h3>A fixed foundation</h3>
          <p>Midnight navy is the anchor — heavy, grounded, trustworthy. The kind of place where serious work happens, every day.</p>
        </div>
        <div className="pillar">
          <span className="sym">→</span>
          <span className="tag">Progress</span>
          <h3>Always moving forward</h3>
          <p>The forward arrow is our motion signature — a directional device in every detail, for professionals who don&#39;t stand still.</p>
        </div>
        <div className="pillar">
          <span className="sym">✦</span>
          <span className="tag">Community</span>
          <h3>Warmth that holds</h3>
          <p>Gold is the warmth that binds it together — used sparingly, in the handles, the light, the lettering. Restraint as luxury.</p>
        </div>
      </div>
    </div>
  </section>

  
  <section className="pad section-ivory">
    <div className="wrap">
      <div className="sec-head reveal">
        <span className="eyebrow">03 · Everything included</span>
        <h2 className="section-title"><span className="thin">Membership that</span> takes care of the rest.</h2>
      </div>
      <div className="amenity-strip reveal d1">
        <div className="cell">
          <div className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12.5a10 10 0 0114 0M8 15.5a6 6 0 018 0"></path><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"></circle></svg></div>
          <h4>1 Gbps Wi-Fi</h4><p>Enterprise fibre with wired backup.</p>
        </div>
        <div className="cell">
          <div className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 8h1a3 3 0 010 6h-1M4 8h14v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM7 3v2M11 3v2M15 3v2"></path></svg></div>
          <h4>Café &amp; Pantry</h4><p>Barista coffee and a stocked pantry.</p>
        </div>
        <div className="cell">
          <div className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="14" rx="1.5"></rect><path d="M3 9h18M8 22h8"></path></svg></div>
          <h4>Meeting Rooms</h4><p>A 4-seater and a boardroom with VC.</p>
        </div>
        <div className="cell">
          <div className="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 21l-4.9 2.6a.01.01 0 010 0l.9-5.4-4-3.9 5.5-.8z" transform="scale(.9) translate(1.3 -0.2)"></path></svg></div>
          <h4>Business Services</h4><p>Virtual office, GST, Udyam &amp; incorporation help.</p>
        </div>
      </div>
      <div className="reveal d2" style={{"marginTop": "2rem"}}>
        <a className="link-arw" href="/amenities">See all amenities <span className="arw">→</span></a>
      </div>
    </div>
  </section>

  
  <section className="pad-sm cta-band grid-texture">
    <div className="grid-texture"></div>
    <div className="wrap">
      <div className="inner reveal">
        <h2>Reserve your space at <span className="gold-line">Collabix</span> — it takes about a minute.</h2>
        <a className="btn btn-gold" href="/booking">Book a Space <span className="arw">→</span></a>
      </div>
    </div>
  </section>

  
  <section className="pad section-ivory" id="location">
    <div className="wrap">
      <div className="loc">
        <div className="reveal">
          <span className="eyebrow">04 · Find us</span>
          <h2 className="section-title" style={{"margin": "1rem 0 1.6rem"}}>Banaswadi, Bengaluru.</h2>
          <div className="addr-row"><span className="lab">Address</span><span className="val">Collabix Work Lounge, 261, Ashwini Arcade, 3rd Floor, 100 Feet Road, HRBR Layout,<br />Bengaluru, Karnataka 560043</span></div>
          <div className="addr-row"><span className="lab">Hours</span><span className="val">Mon–Sat, 08:00–20:00 &nbsp;·&nbsp; After hours (20:00–07:00) at 20% extra</span></div>
          <div className="addr-row"><span className="lab">Enquiries</span><span className="val"><a href="tel:+919632771444">+91 96327 71444</a> &nbsp;·&nbsp; <a href="mailto:connect@collabix.co.in">connect@collabix.co.in</a></span></div>
          <div style={{"marginTop": "1.8rem"}}><a className="btn btn-navy" href="/booking">Book a tour &amp; space <span className="arw">→</span></a></div>
        </div>
        <div className="map reveal d1">
          <iframe title="Collabix location map — Banaswadi, Bengaluru" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=Banaswadi%2C%20Bengaluru&t=&z=14&ie=UTF8&iwloc=&output=embed"></iframe>
        </div>
      </div>
    </div>
  </section>

  
  

  

  
  

  

</>; }
