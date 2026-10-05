import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { isTicketToken, ticketState } from "@/lib/domain/ticket";
import { getTicketView, toTicketBooking } from "@/lib/domain/ticket-view";
import { ticketQrSvg } from "@/lib/ticket-qr";
import { TicketPass } from "@/components/ticket/ticket-pass";
import { LiveRefresh } from "@/components/ticket/live-refresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Collabix ticket",
  robots: { index: false, follow: false },
};

export default async function TicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  if (!isTicketToken(token)) notFound();
  const view = await getTicketView(db, { token });
  if (!view) notFound();

  const settings = await getSettings(db);
  const state = ticketState(toTicketBooking(view, settings), new Date());
  const qrSvg = await ticketQrSvg(token);

  return (
    <main className="min-h-screen bg-[#F7F5F2] px-4 py-8">
      <TicketPass view={view} state={state} qrSvg={qrSvg} />
      <LiveRefresh seconds={15} />
    </main>
  );
}
