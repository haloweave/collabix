"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
export default function SiteShell({children, minimal=false}: {children: React.ReactNode; minimal?: boolean; authed?: boolean}) {
 const [open,setOpen]=useState(false);
 const path=usePathname();
 const links=[["/#spaces","Spaces"],["/amenities","Amenities"],["/pricing","Pricing"],["/#location","Location"]];
 return <div className="collabix-site">
 <header className="site-header solid"><div className="wrap bar">
 <Link className="logo" href="/" aria-label="Collabix home"><Image width={3088} height={852} sizes="(max-width: 820px) 100vw, 50vw" src="/collabix/img/logo-white.png" alt="Collabix — Work Lounge" /></Link>
 <nav id="home-navigation" aria-label="Main navigation" className={`nav ${open?"open":""}`}>
 {links.map(([href,label])=><a key={href} className={`navlink ${path===href?"active":""}`} href={href} onClick={()=>setOpen(false)}>{label}</a>)}
 <a className="btn btn-gold" href="tel:+919632771444" aria-label="Call Collabix on +91 96327 71444">Call +91 96327 71444</a>
 {/* Login / Account link hidden for now — `authed` is still passed in for when it returns. */}</nav>
 <button className="nav-toggle" aria-label={open?"Close menu":"Open menu"} aria-expanded={open} aria-controls="home-navigation" onClick={()=>setOpen(!open)}><span/><span/><span/></button>
 </div></header>
 <main id="main-content">{children}</main>
 <footer className="site-footer">
    <div className="grid-texture"></div>
    <div className="wrap">
      {!minimal && <div className="footer-top">
        <div>
          <Image width={3088} height={852} sizes="(max-width: 820px) 100vw, 50vw" className="flogo" src="/collabix/img/logo-white.png" alt="Collabix — Work Lounge" />
          <p style={{"maxWidth": "300px", "fontSize": ".92rem", "lineHeight": "1.7"}}>A premium managed work lounge in Banaswadi, Bengaluru. Where serious work happens.</p>
        </div>
        <div>
          <h5>Explore</h5>
          <Link href="/#spaces">Spaces</Link><br />
          <a href="/amenities">Amenities</a><br />
          <a href="/pricing">Pricing</a><br />
          <Link href="/#location">Location</Link><br />
          <a href="/booking">Book a Space</a>
        </div>
        <div>
          <h5>Visit</h5>
          <Link href="/#location">261, Ashwini Arcade, 3rd Floor, 100 Feet Road, HRBR Layout<br />Bengaluru 560043</Link><br />
          <a href="mailto:connect@collabix.co.in">connect@collabix.co.in</a><br />
          <a href="tel:+919632771444">+91 96327 71444</a><br />

        </div>
      </div>}
      <div className="footer-bottom">
        <span>COLLABIX © <span data-year="">2026</span> · Work Lounge · Banaswadi, Bengaluru</span>
      </div>
    </div>
  </footer>
 <nav className="tabbar" aria-label="Quick navigation">{[["/","Home"],["/#spaces","Spaces"],["/booking","Book"],["/pricing","Pricing"],["/amenities","Amenities"]].map(([href,label])=><a key={href} href={href} className={`tab ${path===href?"active":""}`} aria-current={path===href?"page":undefined}>{label}</a>)}</nav>
 </div>;
}
