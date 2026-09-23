import Image from "next/image";
import type { Metadata } from "next";
export const metadata: Metadata = {title: "Collabix \u00b7 Amenities"};
export default function Page() { return <>


  
  

  
  <section className="page-hero grid-texture">
    <div className="glow"></div>
    <div className="grid-texture"></div>
    <div className="wrap">
      <span className="eyebrow reveal">Membership · Everything included</span>
      <h1 className="reveal d1">Amenities that do the quiet work.</h1>
      <p className="lead reveal d2">Every surface, every fitting, every degree of light is specified to one standard — so you can simply arrive and get to work.</p>
    </div>
  </section>

  
  <section className="pad section-ivory">
    <div className="wrap">
      <div className="amen-grid">

        <article className="amen-card reveal">
          <div className="ph"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/hero.jpg" alt="Open work lounge" /></div>
          <div className="txt"><span className="num">01</span><h3>Open Work Lounge</h3>
            <p>28 shared desks on a calm, ivory-toned floor — hot desks and dedicated seats, natural light, low hum, room to think.</p></div>
        </article>

        <article className="amen-card reveal d1">
          <div className="ph"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/cabin.jpg" alt="Private cabins" /></div>
          <div className="txt"><span className="num">02</span><h3>Private Cabins</h3>
            <p>Four enclosed cabins, each for a team of four — standard fit-out, ready to occupy, with meeting credits and guest passes on Pro and Enterprise plans.</p></div>
        </article>

        <article className="amen-card reveal d2">
          <div className="ph"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/meeting.jpg" alt="Meeting rooms" /></div>
          <div className="txt"><span className="num">03</span><h3>Meeting &amp; Boardrooms</h3>
            <p>A compact 4-seat meeting room with TV and whiteboard, and an 8-seat boardroom with integrated VC and an interactive panel — bookable by the hour.</p></div>
        </article>

        <article className="amen-card reveal">
          <div className="ph"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/cafe.jpg" alt="Café and pantry" /></div>
          <div className="txt"><span className="num">04</span><h3>Café &amp; Pantry</h3>
            <p>Barista-grade coffee, a stocked pantry and a warm place to meet between the desk and the door.</p></div>
        </article>

        <article className="amen-card reveal d1">
          <div className="ph"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/lounge.jpg" alt="Breakout lounge" /></div>
          <div className="txt"><span className="num">05</span><h3>Lounge &amp; Breakout</h3>
            <p>Comfortable breakout zones for informal calls, quick syncs, or a change of scene mid-afternoon.</p></div>
        </article>

        <article className="amen-card reveal d2">
          <div className="ph"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/photos/booth.jpg" alt="Focus and phone booths" /></div>
          <div className="txt"><span className="num">06</span><h3>Focus &amp; Phone Booths</h3>
            <p>Sound-isolated booths for one-on-ones and private calls — step in, close the door, concentrate.</p></div>
        </article>

      </div>
    </div>
  </section>

  
  <section className="pad-sm section-ivory-dark">
    <div className="wrap">
      <div className="sec-head reveal">
        <span className="eyebrow">Included with every membership</span>
        <h2 className="section-title"><span className="thin">The details, </span>handled.</h2>
      </div>
      <div className="feat-list reveal d1">
        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 11a12 12 0 0116 0M7 14.5a7 7 0 0110 0"></path><circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none"></circle></svg></span>
          <div><h4>1 Gbps Enterprise Wi-Fi</h4><p>Redundant fibre with wired connections at every desk.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"></path></svg></span>
          <div><h4>Warm 2700K Lighting</h4><p>Light tuned to warm white, Ra&gt;90 — never cool, never clinical.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="3" width="16" height="18" rx="1.5"></rect><path d="M9 3v18"></path><circle cx="6.5" cy="12" r="1" fill="currentColor" stroke="none"></circle></svg></span>
          <div><h4>Lockers &amp; Storage</h4><p>A personal locker with every Dedicated Desk and Dedicated Desk Pro plan.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path></svg></span>
          <div><h4>Extended Hours</h4><p>Mon–Sat, 08:00–20:00, with after-hours access (20:00–07:00) at 20% extra.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 9V4h12v5M6 18H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-1"></path><rect x="7" y="15" width="10" height="6"></rect></svg></span>
          <div><h4>Printing Included</h4><p>10 to 30 pages of prints a month, depending on your plan.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7l9 6 9-6M3 7v10a1 1 0 001 1h16a1 1 0 001-1V7a1 1 0 00-1-1H4a1 1 0 00-1 1z"></path></svg></span>
          <div><h4>Reception &amp; Mail</h4><p>A staffed front desk to greet guests, with mail notification and pouch forwarding via Bluedart.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="10" r="2.2"></circle><path d="M3 20a6 6 0 0112 0M14 20a5 5 0 017 0"></path></svg></span>
          <div><h4>Community &amp; Events</h4><p>Curated meetups, workshops and a genuinely senior network.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 19v-6a6 6 0 0112 0v6M9 19v-5a3 3 0 016 0v5M4 19h16"></path></svg></span>
          <div><h4>Ergonomic Seating</h4><p>Task chairs and ivory-toned upholstery specified for full days.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="14" rx="1.5"></rect><path d="M3 9h18M8 22h8"></path></svg></span>
          <div><h4>Meeting-Room Credits</h4><p>Credits bundled with desk, cabin and virtual plans — 1 credit is 1 hour of room time.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3"></circle><path d="M3 20a6 6 0 0112 0M17 8v6M14 11h6"></path></svg></span>
          <div><h4>Guest Passes</h4><p>Bring a guest in on Dedicated Desk Pro and Cabin Enterprise plans.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"></path></svg></span>
          <div><h4>Virtual Office</h4><p>A Banaswadi business address with GST NOC, mail handling and name-board display.</p></div></div>

        <div className="feat"><span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"></path></svg></span>
          <div><h4>Happy to Help Service Desk</h4><p>GST registration and filing, Udyam registration and company / LLP incorporation.</p></div></div>
      </div>
    </div>
  </section>

  
  <section className="pad section-ivory">
    <div className="wrap">
      <div className="loc">
        <div className="reveal">
          <span className="eyebrow">Opening hours</span>
          <h2 className="section-title" style={{"margin": "1rem 0 1rem"}}>Open when you are.</h2>
          <p className="lead">We&#39;re open Monday to Saturday, with after-hours access for members who need it. Reception, café and tours run to the hours below.</p>
          <div style={{"marginTop": "1.8rem"}}><a className="btn btn-navy" href="/booking">Book a Space <span className="arw">→</span></a></div>
        </div>
        <div className="hours-card grid-texture reveal d1">
          <div className="grid-texture"></div>
          <div className="hours-row"><span className="d">Standard hours · Mon – Sat</span><span className="t">08:00 – 20:00</span></div>
          <div className="hours-row"><span className="d">After hours · +20%</span><span className="t">20:00 – 07:00</span></div>
          <div className="hours-row"><span className="d">Sunday</span><span className="t">Closed</span></div>
          <div className="hours-row"><span className="d">Café &amp; pantry</span><span className="t">08:00 – 19:00</span></div>
          <div className="hours-row"><span className="d">Guided tours</span><span className="t">By appointment</span></div>
        </div>
      </div>
    </div>
  </section>

  
  

  

  
  

  

</>; }
