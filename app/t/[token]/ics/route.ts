import { db } from "@/lib/db/client";
import { isTicketToken } from "@/lib/domain/ticket";
import { ticketIcs } from "@/lib/domain/ticket-ics";
import { getTicketView } from "@/lib/domain/ticket-view";
import { ticketUrl } from "@/lib/ticket-qr";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = isTicketToken(token) ? await getTicketView(db, { token }) : null;
  if (!view || view.status !== "active") return new Response("Not found", { status: 404 });

  return new Response(ticketIcs(view, ticketUrl(token)), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="collabix-booking.ics"',
    },
  });
}
