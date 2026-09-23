import type { Metadata } from "next";
import { money } from "@/lib/spaces";
import { tariff, tariffNotes, EARLY_BIRD_DEADLINE, type TariffSection } from "@/lib/tariff";
export const metadata: Metadata = { title: "Collabix · Membership & pricing" };

const unitLabel: Record<TariffSection["unit"], string> = { month: "/ month", hour: "/ hour", day: "/ day", service: "" };

function TariffTable({ section }: { section: TariffSection }) {
  const hasEarly = section.rows.some((r) => r.earlyBird != null);
  const hasAnnual = section.rows.some((r) => r.annual != null);
  const per = unitLabel[section.unit];
  return (
    <div className="pr-table-wrap">
      <table className="pr-run-table tf-table">
        <thead>
          <tr>
            <th>{section.unit === "service" ? "Service" : "Plan"}</th>
            <th className="num">{section.unit === "service" ? "Price" : `Standard ${per}`}</th>
            {hasEarly && <th className="num">Early Bird {per}</th>}
            {hasAnnual && <th className="num">Annual</th>}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((r) => (
            <tr key={r.name}>
              <td className="svc">{r.name}<small>{r.includes}</small></td>
              <td className="num">{money(r.standard)}</td>
              {hasEarly && <td className="num tf-early">{r.earlyBird != null ? money(r.earlyBird) : "—"}</td>}
              {hasAnnual && <td className="num">{r.annual != null ? money(r.annual) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Pricing() {
  return <>
    <section className="page-hero grid-texture">
      <div className="glow"></div>
      <div className="grid-texture"></div>
      <div className="wrap">
        <span className="eyebrow">Membership &amp; Services Tariff 2026</span>
        <h1>Space to work. Room to grow.</h1>
        <p className="lead">Monthly desks and cabins, meeting rooms by the hour, day passes, virtual office plans and business services. All prices are before 18% GST.</p>
        <p className="tf-early-banner">Early Bird pricing for bookings before {EARLY_BIRD_DEADLINE}</p>
      </div>
    </section>

    <section className="pad section-ivory">
      <div className="wrap">
        <nav className="pr-chips tf-jump" aria-label="Jump to a plan">
          {tariff.map((s) => <a key={s.id} className="pr-chip" href={`#${s.id}`}>{s.title}</a>)}
        </nav>

        {tariff.map((s) => (
          <div key={s.id} id={s.id} className="tf-block">
            <div className="tf-head">
              <h2>{s.title}</h2>
              {s.subtitle && <span className="kicker">{s.subtitle}</span>}
            </div>
            <TariffTable section={s} />
            {s.note && <p className="pr-note-inline tf-note">{s.note}</p>}
          </div>
        ))}

        <div className="tf-block tf-notes">
          <h3>Please note</h3>
          <ul>{tariffNotes.map((n) => <li key={n}>{n}</li>)}</ul>
          <p>Questions about a plan? Call <a href="tel:+919632771444">+91 96327 71444</a> or write to <a href="mailto:connect@collabix.co.in">connect@collabix.co.in</a>.</p>
        </div>
      </div>
    </section>
  </>;
}
