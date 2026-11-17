import { Wallet } from "lucide-react";
import { requireMember } from "@/lib/account/auth";
import { db } from "@/lib/db/client";
import { walletBalance, walletHistory } from "@/lib/domain/wallet";
import { rupees, istDate } from "@/lib/admin/format";
import { WALLET_KIND_LABEL } from "@/lib/wallet-labels";

export const dynamic = "force-dynamic";

export default async function MyWalletPage() {
  const member = await requireMember();
  const [balance, history] = await Promise.all([walletBalance(db, member.id), walletHistory(db, member.id)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Wallet</h1>
        <p className="text-sm text-navy/60">
          Prepaid credit for your bookings. Top up at reception, then choose
          &ldquo;Pay from wallet&rdquo; when you book.
        </p>
      </div>

      <section className="flex items-center gap-4 rounded-2xl bg-navy p-5 text-ivory sm:p-6">
        <Wallet className="size-8 shrink-0 text-gold" aria-hidden />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Balance</p>
          <p className="text-3xl font-semibold tabular-nums !text-ivory">{rupees(balance)}</p>
        </div>
      </section>

      {history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-navy/20 bg-white/60 px-6 py-8 text-center text-sm text-navy/60">
          No wallet activity yet.
        </p>
      ) : (
        <ul className="divide-y divide-navy/10 overflow-hidden rounded-xl border border-navy/10 bg-white">
          {history.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-navy">{WALLET_KIND_LABEL[e.kind] ?? e.kind}</p>
                <p className="text-xs text-navy/50">
                  {istDate(e.createdAt)}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
              <span className={`shrink-0 font-semibold tabular-nums ${e.amountMinor < 0 ? "text-navy/60" : "text-emerald-700"}`}>
                {e.amountMinor < 0 ? "− " : "+ "}
                {rupees(Math.abs(e.amountMinor))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
