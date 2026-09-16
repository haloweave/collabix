import type { Metadata } from "next";
export const metadata: Metadata = {title: "Collabix \u00b7 Development proposal"};
export default function Page() { return <>
<p className="proposal-context">Archived development proposal · figures and service fees are indicative, not current provider quotes.</p>


  
  

  
  <section className="page-hero grid-texture">
    <div className="glow"></div>
    <div className="grid-texture"></div>
    <div className="wrap">
      <span className="eyebrow reveal">Proposal · Complete cost breakdown</span>
      <h1 className="reveal d1">Every rupee, itemised.</h1>
      <p className="lead reveal d2">Exactly what the booking platform and website cost to build, line by line, and the handful of services that cost anything to run, with the free limits that keep them at zero until you grow.</p>
    </div>
  </section>

  
  <section className="pad-sm section-ivory">
    <div className="wrap">
      <div className="sec-head reveal" style={{"marginBottom": "1.4rem"}}>
        <span className="eyebrow">At a glance</span>
        <h2 className="section-title"><span className="thin">The number,</span> up front.</h2>
      </div>
      <div className="pr-summary reveal">
        <div className="pr-sum-main">
          <span className="lab">Total to build</span>
          <div className="big">₹1,09,000</div>
          <span className="sub">one-time · no GST applicable</span>
        </div>
        <div className="pr-sum-grid">
          <div className="pr-sum-item"><span className="k">4 weeks</span><span className="l">Delivery, from the advance</span></div>
          <div className="pr-sum-item"><span className="k">50 / 50</span><span className="l">Advance, then on go-live</span></div>
          <div className="pr-sum-item"><span className="k">from ₹6,920<small>/mo</small></span><span className="l">To host, run &amp; support</span></div>
        </div>
      </div>
    </div>
  </section>

  
  <section className="pad section-ivory">
    <div className="wrap">
      <div className="sec-head reveal">
        <span className="eyebrow">01 · One-time</span>
        <h2 className="section-title"><span className="thin">What you&#39;re</span> paying to build.</h2>
        <p className="lead">A one-time <b>₹1,09,000</b>: the booking management platform (₹94,000) and the website that fronts it (₹15,000). Here&#39;s the architecture we&#39;re building, then every line that adds up to the total.</p>
      </div>

      
      <div className="reveal" style={{"marginBottom": "2.4rem"}}>
        <span className="eyebrow plain" style={{"color": "var(--gold)"}}>What we&#39;re building</span>
        <div className="pr-arch">
          <div className="pr-layer">
            <span className="ln">Experience</span>
            <div className="pr-chips"><span className="pr-chip">Booking website</span><span className="pr-chip">Multi-step booking flow</span><span className="pr-chip">Floor-plan seat picker</span><span className="pr-chip">Admin dashboard</span><span className="pr-chip">Reports &amp; analytics</span></div>
          </div>
          <div className="pr-layer">
            <span className="ln">Core engine</span>
            <div className="pr-chips"><span className="pr-chip">Availability &amp; booking logic</span><span className="pr-chip">Members &amp; memberships</span><span className="pr-chip">Payments &amp; invoicing</span><span className="pr-chip">Payment verification</span><span className="pr-chip">Database + secure API</span><span className="pr-chip">Login &amp; roles</span></div>
          </div>
          <div className="pr-layer">
            <span className="ln">Integrations</span>
            <div className="pr-chips"><span className="pr-chip"><b>Zoho Books</b> · GST invoicing</span><span className="pr-chip"><b>Payment gateway</b> · checkout</span><span className="pr-chip"><b>Email</b> · confirmations</span><span className="pr-chip"><b>Zoho / Google</b> · inboxes</span><span className="pr-chip"><b>WhatsApp</b> · messaging</span></div>
          </div>
          <div className="pr-layer">
            <span className="ln">Runs on</span>
            <div className="pr-chips"><span className="pr-chip"><b>Vercel</b> · hosting, SSL &amp; CDN</span><span className="pr-chip"><b>Managed Postgres</b> · database</span></div>
          </div>
        </div>
        <p className="pr-note-inline" style={{"marginTop": "1.1rem"}}>How it flows: a member books a desk, the engine holds the slot, the payment gateway takes payment, Zoho Books raises a GST invoice, then it&#39;s emailed and WhatsApp confirms. All automatic, no manual work.</p>
      </div>

      
      <div className="pr-invoice reveal">
        <div className="grp">
          <div className="grp-head"><span className="t">Booking Management Platform</span><span className="sum">₹94,000</span></div>
          <ul className="pr-feats">
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Booking engine with live floor-plan seat picker</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Real-time availability, hold, confirm &amp; double-booking prevention</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Hourly, daily &amp; recurring bookings</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Admin dashboard &amp; occupancy calendar</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Visitor management dashboard (check-in / out &amp; visitor log)</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Member management &amp; profiles (records, ID / KYC, history)</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Member login &amp; verification with access control</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Membership plans, credits &amp; wallet</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Pricing, discounts &amp; coupons</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Payment gateway integration (UPI, cards &amp; net-banking)</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Zoho Books invoicing (auto GST invoices)</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Email &amp; WhatsApp automation</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Notifications &amp; reminders (cancellations, no-show)</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Reports &amp; analytics (revenue, occupancy, activity)</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Staff roles &amp; permissions</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Secure backend, database, auth &amp; deployment</span></li>
          </ul>
        </div>
        <div className="grp">
          <div className="grp-head"><span className="t">Website (UI)</span><span className="sum">₹15,000</span></div>
          <ul className="pr-feats">
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Home &amp; Amenities pages on the Collabix brand</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Multi-step booking flow with floor-plan visuals</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>Mobile &amp; desktop friendly, app-like experience</span></li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C89B53" strokeWidth="2.4"><path d="M5 13l4 4L19 7"></path></svg><span>SEO setup (meta tags, sitemap, Google-ready)</span></li>
          </ul>
        </div>
        <div className="total"><span className="l">One-time total</span><span className="amt">₹1,09,000</span></div>
      </div>

      <div className="pr-terms reveal">
        <div className="pr-term"><span className="k"><span>4 weeks</span></span><span className="l">Delivery, from the date the advance is paid</span></div>
        <div className="pr-term"><span className="k">50% advance</span><span className="l">To begin the build</span></div>
        <div className="pr-term"><span className="k">50% on go-live</span><span className="l">Payable once it&#39;s live &amp; bug-tested</span></div>
      </div>
      <p className="pr-note-inline reveal" style={{"marginTop": "1rem"}}>One-time · no GST applicable</p>
    </div>
  </section>

  
  <section className="pad section-navy grid-texture">
    <div className="grid-texture"></div>
    <div className="wrap">
      <div className="sec-head reveal">
        <span className="eyebrow">02 · Monthly</span>
        <h2 className="section-title">What it costs to run.</h2>
        <p className="lead">Once it&#39;s live, this is the whole ongoing bill. Most services sit on generous free tiers, so you only start paying when volume grows past the limits in the last column.</p>
      </div>

      <div className="pr-table-wrap reveal d1">
        <table className="pr-run-table">
          <thead>
            <tr><th>Service</th><th className="num">One-time</th><th className="num">Monthly</th><th>Free until you pay</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="svc">Hosting (Vercel Pro)<small>fast global hosting, SSL &amp; CDN</small></td>
              <td className="num">Nil</td><td className="num">₹1,720/mo</td><td className="free">Vercel Pro, per current pricing</td>
            </tr>
            <tr>
              <td className="svc">Care &amp; Support<small>tech support, maintenance, bug fixes, minor updates &amp; technical assistance for the platform</small></td>
              <td className="num">Nil</td><td className="num">₹3,500/mo</td><td className="free">Our managed service, flat fee</td>
            </tr>
            <tr>
              <td className="svc">Database (managed Postgres)<small>stores spaces, bookings &amp; members</small></td>
              <td className="num">in ₹94,000</td><td className="num">₹1,700/mo</td><td className="free">Production tier, managed Postgres</td>
            </tr>
            <tr>
              <td className="svc">Zoho Books invoicing<small>auto GST invoices from bookings</small></td>
              <td className="num">in ₹94,000</td><td className="num"><span className="pill-free">Free</span></td><td className="free">On Zoho&#39;s free plan, for now</td>
            </tr>
            <tr>
              <td className="svc">Email sending<small>confirmations, receipts &amp; reminders</small></td>
              <td className="num">in ₹94,000</td><td className="num"><span className="pill-free">Free</span></td><td className="free">Up to 3,000 emails/mo, then ₹1,720/mo</td>
            </tr>
            <tr>
              <td className="svc">Team inboxes (Zoho Mail / Google)<small>you@collabix.in mailboxes for staff</small></td>
              <td className="num">in ₹94,000</td><td className="num"><span className="pill-free">Free</span></td><td className="free">Up to 5 inboxes on Zoho; Google from ₹136/user/mo</td>
            </tr>
            <tr>
              <td className="svc">WhatsApp automation<small>booking confirmations &amp; front-desk alerts</small></td>
              <td className="num">in ₹94,000</td><td className="num">usage</td><td className="free">About ₹0.30 per message sent</td>
            </tr>
            <tr>
              <td className="svc">Payment gateway<small>collect payments at booking</small></td>
              <td className="num">in ₹94,000</td><td className="num">Nil</td><td className="free">About 2% per transaction, only when you get paid</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="pr-note-inline reveal" style={{"marginTop": "1.2rem", "color": "rgba(247,245,242,.62)"}}>A line marked “in ₹94,000” means that integration is already built into the one-time platform cost, so you only ever pay a service&#39;s own fee if you cross its free limit. Rates are current published prices (Jul 2026), no GST applicable.</p>

      
      <div className="pr-exclude reveal d1">
        <span className="eyebrow plain" style={{"color": "var(--gold-light)"}}>Please note</span>
        <p>This breakdown covers only what&#39;s itemised above. It <b>does not include any cost not listed here</b>, for example domain registration, paid ad spend, third-party licences, SMS / OTP gateways, or usage beyond the free tiers (email above 3,000/mo, mailboxes beyond Zoho&#39;s free 5 or on Google Workspace, WhatsApp messages, payment gateway volume), which are billed at actuals. No GST applicable.</p>
      </div>
    </div>
  </section>

  
  <section className="pad-sm cta-band grid-texture">
    <div className="grid-texture"></div>
    <div className="wrap">
      <div className="inner reveal">
        <h2>Questions on any line? Let&#39;s <span className="gold-line">walk through it</span>.</h2>
        <a className="btn btn-gold" href="/home/booking">Start a conversation <span className="arw">→</span></a>
      </div>
    </div>
  </section>

  
  

  

  
  

  

</>; }
