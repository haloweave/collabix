import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";
import { requireMember } from "@/lib/account/auth";
import { listMyDocuments, type MyDocument } from "@/lib/account/invoices";
import { financialYear } from "@/lib/domain/invoice-number";
import { rupees, istDate } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS: Record<MyDocument["status"], { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-900" },
  due: { label: "Pay at desk", className: "bg-amber-100 text-amber-900" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700" },
};

export default async function MyInvoicesPage() {
  const member = await requireMember();
  const docs = await listMyDocuments(member.id, member.email);

  const fy = docs[0] ? financialYear(docs[0].issuedAt) : null;
  const thisYear = docs.filter((d) => d.status !== "cancelled" && fy && financialYear(d.issuedAt) === fy);
  const spent = thisYear.reduce((s, d) => s + d.totalMinor, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">Invoices</h1>
          <p className="text-sm text-navy/60">
            GST tax invoices for every booking. Add your company and GSTIN on your{" "}
            <Link href="/account/profile" className="font-medium text-navy underline decoration-gold underline-offset-4">
              profile
            </Link>{" "}
            to claim input credit.
          </p>
        </div>
        {fy && thisYear.length > 0 && (
          <div className="rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy/50">FY 20{fy}</p>
            <p className="text-lg font-semibold leading-tight text-navy">{rupees(spent)}</p>
            <p className="text-xs text-navy/50">
              across {thisYear.length} invoice{thisYear.length === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-navy/20 bg-white/60 px-6 py-12 text-center">
          <FileText className="!mx-auto size-8 text-gold" aria-hidden />
          <p className="!mt-3 text-lg font-semibold text-navy">No invoices yet</p>
          <p className="!mx-auto !mt-1 max-w-sm text-sm text-navy/60">
            An invoice is issued the moment a booking is confirmed, and you can
            download it here any time.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-navy/10 overflow-hidden rounded-xl border border-navy/10 bg-white">
          {docs.map((d) => {
            const s = STATUS[d.status];
            const href = `/account/invoices/${d.id}`;
            return (
              <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-navy">{d.number}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        s.className,
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-navy">{d.title}</p>
                  <p className="text-xs text-navy/50">
                    {d.period} · Issued {istDate(d.issuedAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <span className={cn("text-base font-semibold text-navy", d.status === "cancelled" && "text-navy/40 line-through")}>
                    {rupees(d.totalMinor)}
                  </span>
                  <div className="flex items-center gap-1">
                    <a
                      href={`${href}?view=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-navy/70 hover:bg-navy/[0.06] hover:text-navy"
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      View
                    </a>
                    <a
                      href={href}
                      download
                      className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-sm font-medium !text-ivory hover:bg-navy-mid"
                    >
                      <Download className="size-4" aria-hidden />
                      PDF
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
