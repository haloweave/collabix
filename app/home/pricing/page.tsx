import Image from "next/image";
import type { Metadata } from "next";
import { spaces, money } from "@/lib/spaces";
import { getActiveRates } from "@/lib/rates";
export const metadata: Metadata = { title: "Collabix · Workspace pricing" };
// Rendered per request so the advertised rates always match the live rate plans
// edited in the admin panel.
export const dynamic = "force-dynamic";
export default async function Pricing() {
 const rates = await getActiveRates();
 return <><section className="page-hero"><div className="wrap"><span className="eyebrow">A space for your working day</span><h1>Space to work. Room to grow.</h1><p className="lead">Explore indicative hourly rates. Final plans and rates will be confirmed before launch.</p></div></section>
 <section className="pad section-ivory"><div className="wrap"><div className="spaces">{spaces.map(space=><a key={space.key} className="space-card" href={`/home/booking?space=${space.key}`}><div className="img"><Image width={1200} height={800} sizes="(max-width: 820px) 100vw, 50vw" src={`/collabix/img/photos/${space.image}`} alt={space.name}/></div><div className="body"><span className="kicker">Up to {space.capacity} {space.capacity===1?"person":"people"}</span><h2>{space.name}</h2><p>{space.description}</p><div className="price"><span className="amt">{money(rates[space.key] ?? space.rate)}</span><span className="per">/ hour · before tax</span><span className="book">Explore →</span></div></div></a>)}</div><p style={{marginTop:"2rem"}}>Need a monthly desk or a team plan? <a className="link-arw" href="mailto:connect@collabix.co.in">Get in touch →</a></p></div></section></>;
}
