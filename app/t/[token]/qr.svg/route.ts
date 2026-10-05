import { db } from "@/lib/db/client";
import { isTicketToken } from "@/lib/domain/ticket";
import { getTicketView } from "@/lib/domain/ticket-view";
import { ticketQrSvg } from "@/lib/ticket-qr";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTicketToken(token) || !(await getTicketView(db, { token }))) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(await ticketQrSvg(token), {
    headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" },
  });
}
