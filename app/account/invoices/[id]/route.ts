import { getMemberSession } from "@/lib/account/auth";
import { isStaff } from "@/lib/admin/auth";
import { getInvoiceDoc } from "@/lib/account/invoices";
import { renderInvoicePdf } from "@/lib/invoice/pdf";

// GET /account/invoices/<booking or statement id>[?view=1]: the PDF, as a
// download (or inline with ?view=1). Only its customer — or staff — may fetch it.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMemberSession();
  if (!me) return new Response("Sign in to download invoices.", { status: 401 });

  const { id } = await params;
  const found = await getInvoiceDoc(id);
  const mine =
    found &&
    (found.memberId === me.id ||
      (found.email != null && found.email.toLowerCase() === me.email.toLowerCase()) ||
      isStaff(me.role));
  // Someone else's id reads the same as a missing one.
  if (!found || !mine) return new Response("Not found", { status: 404 });

  const pdf = await renderInvoicePdf(found.doc);
  const file = `Collabix-${found.doc.number.replace(/\//g, "-")}.pdf`;
  const inline = new URL(req.url).searchParams.has("view");
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${file}"`,
      "cache-control": "private, no-store",
    },
  });
}
