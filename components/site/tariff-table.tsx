import { money } from "@/lib/spaces";
import type { TariffSection } from "@/lib/tariff";

const unitLabel: Record<TariffSection["unit"], string> = { month: "/ month", hour: "/ hour", day: "/ day", service: "" };

/** One tariff section as a price table. The Early Bird column shows only when `showEarly` is set. */
export function TariffTable({ section, showEarly }: { section: TariffSection; showEarly: boolean }) {
  const { rows } = section;
  const hasEarly = showEarly && rows.some((r) => r.earlyBird != null);
  const hasAnnual = rows.some((r) => r.annual != null);
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
          {rows.map((r) => (
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
