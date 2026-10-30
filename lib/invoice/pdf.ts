import "server-only";
// Draws an InvoiceDoc as an A4 PDF. Inter is embedded (subset) because the
// standard PDF fonts have no ₹ glyph.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { amountInWords } from "./amount-in-words";
import type { InvoiceDoc } from "./document";
import { SELLER } from "./seller";
import { paymentMethodLabel } from "./payment-method";

const hex = (h: string): RGB =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const NAVY = hex("#0B1F3A");
const GOLD = hex("#C89B53");
const IVORY = hex("#F7F5F2");
const LINE = hex("#E4DFD7");
const MUTED = hex("#6B7280");
const GREEN = hex("#1F7A4D");
const RED = hex("#B42318");

const W = 595.28;
const H = 841.89;
const M = 48;

const ASSETS = path.join(process.cwd(), "lib/invoice/fonts");
const LOGO = path.join(process.cwd(), "public/logo-navy.png");

export const inr = (minor: number) =>
  `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const istDay = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

/** Break text into lines no wider than `width` at the given size. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export async function renderInvoicePdf(doc: InvoiceDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regBytes, semiBytes, logoBytes] = await Promise.all([
    readFile(path.join(ASSETS, "Inter-Regular.ttf")),
    readFile(path.join(ASSETS, "Inter-SemiBold.ttf")),
    readFile(LOGO),
  ]);
  const reg = await pdf.embedFont(regBytes, { subset: true });
  const bold = await pdf.embedFont(semiBytes, { subset: true });
  const logo = await pdf.embedPng(logoBytes);

  const title = "Tax Invoice";
  pdf.setTitle(`${title} ${doc.number}`);
  pdf.setAuthor(SELLER.tradeName);
  pdf.setCreator(SELLER.website);

  const page = pdf.addPage([W, H]);
  const text = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    o: { size?: number; font?: PDFFont; color?: RGB; align?: "left" | "right" } = {},
  ) => {
    const size = o.size ?? 9;
    const font = o.font ?? reg;
    const dx = o.align === "right" ? -font.widthOfTextAtSize(s, size) : 0;
    p.drawText(s, { x: x + dx, y, size, font, color: o.color ?? NAVY });
  };

  // ── Header ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: NAVY });
  const logoH = 30;
  page.drawImage(logo, { x: M, y: H - 70, width: (logo.width / logo.height) * logoH, height: logoH });
  text(page, title.toUpperCase(), W - M, H - 52, { size: 18, font: bold, align: "right" });
  text(page, doc.number, W - M, H - 68, { size: 10, color: MUTED, align: "right" });

  let y = H - 96;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: GOLD });

  // ── Parties ───────────────────────────────────────────────────────────
  y -= 22;
  const colW = (W - 2 * M - 24) / 2;
  const party = (x: number, label: string, rows: { s: string; strong?: boolean; muted?: boolean }[]) => {
    let py = y;
    text(page, label.toUpperCase(), x, py, { size: 7.5, font: bold, color: GOLD });
    py -= 15;
    for (const r of rows) {
      for (const l of wrap(r.s, r.strong ? bold : reg, r.strong ? 10.5 : 9, colW)) {
        text(page, l, x, py, { size: r.strong ? 10.5 : 9, font: r.strong ? bold : reg, color: r.muted ? MUTED : NAVY });
        py -= r.strong ? 14 : 12.5;
      }
    }
    return py;
  };
  const sellerEnd = party(M, "From", [
    { s: SELLER.legalName, strong: true },
    ...SELLER.addressLines.map((s) => ({ s })),
    { s: `GSTIN ${SELLER.gstin}` },
    { s: `${SELLER.phone} · ${SELLER.email}`, muted: true },
  ]);
  const b = doc.buyer;
  const buyerRows: { s: string; strong?: boolean; muted?: boolean }[] = [];
  if (b.companyName) {
    buyerRows.push({ s: b.companyName, strong: true }, { s: `Attn: ${b.name}` });
  } else buyerRows.push({ s: b.name, strong: true });
  if (b.address) buyerRows.push({ s: b.address });
  if (b.gstin) buyerRows.push({ s: `GSTIN ${b.gstin}` });
  buyerRows.push({ s: [b.phone, b.email].filter(Boolean).join(" · "), muted: true });
  const buyerEnd = party(M + colW + 24, "Billed to", buyerRows);
  y = Math.min(sellerEnd, buyerEnd) - 8;

  // ── Facts strip ───────────────────────────────────────────────────────
  const facts: [string, string][] = [["Invoice date", istDay(doc.issuedAt)], ...doc.facts.filter(([k]) => k !== "Service period")];
  const stripH = 40;
  page.drawRectangle({ x: M, y: y - stripH, width: W - 2 * M, height: stripH, color: IVORY });
  const cellW = (W - 2 * M) / facts.length;
  facts.forEach(([k, v], i) => {
    const x = M + 12 + i * cellW;
    text(page, k.toUpperCase(), x, y - 15, { size: 7, font: bold, color: MUTED });
    text(page, wrap(v, bold, 9.5, cellW - 16)[0], x, y - 29, { size: 9.5, font: bold });
  });
  y -= stripH + 26;

  // ── Line items ────────────────────────────────────────────────────────
  const cols = { n: M + 10, desc: M + 30, sac: W - M - 230, qty: W - M - 160, rate: W - M - 90, amt: W - M - 10 };
  const descW = cols.sac - cols.desc - 12;
  page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 24, color: NAVY });
  const head = (s: string, x: number, align?: "right") =>
    text(page, s, x, y, { size: 7.5, font: bold, color: rgb(1, 1, 1), align });
  head("#", cols.n);
  head("DESCRIPTION", cols.desc);
  head("SAC", cols.sac);
  head("QTY", cols.qty, "right");
  head("RATE", cols.rate, "right");
  head("AMOUNT", cols.amt, "right");
  y -= 28;

  doc.lines.forEach((l, i) => {
    const desc = wrap(l.description, bold, 9.5, descW);
    const detail = l.detail ? wrap(l.detail, reg, 8.5, descW) : [];
    text(page, String(i + 1), cols.n, y, { size: 9, color: MUTED });
    desc.forEach((s, j) => text(page, s, cols.desc, y - j * 12.5, { size: 9.5, font: bold }));
    detail.forEach((s, j) => text(page, s, cols.desc, y - desc.length * 12.5 - j * 11, { size: 8.5, color: MUTED }));
    text(page, l.sac, cols.sac, y, { size: 9 });
    text(page, String(l.qty), cols.qty, y, { size: 9, align: "right" });
    text(page, inr(l.unitMinor), cols.rate, y, { size: 9, align: "right" });
    text(page, inr(l.amountMinor), cols.amt, y, { size: 9, font: bold, align: "right" });
    y -= desc.length * 12.5 + detail.length * 11 + 10;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.6, color: LINE });
    y -= 8;
  });

  // ── Totals ────────────────────────────────────────────────────────────
  y -= 6;
  const tx = W - M - 210;
  const totalRow = (k: string, v: string, strong = false) => {
    text(page, k, tx, y, { size: strong ? 10.5 : 9, font: strong ? bold : reg, color: strong ? NAVY : MUTED });
    text(page, v, W - M - 10, y, { size: strong ? 10.5 : 9, font: strong ? bold : reg, align: "right" });
    y -= strong ? 18 : 15;
  };
  const totalsTop = y;
  if (doc.discount) {
    totalRow("Subtotal", inr(doc.subtotalMinor + doc.discount.amountMinor));
    totalRow(`Discount (${doc.discount.code})`, `- ${inr(doc.discount.amountMinor)}`);
  }
  totalRow("Taxable value", inr(doc.subtotalMinor));
  totalRow(`CGST @ ${doc.halfRatePercent}%`, inr(doc.cgstMinor));
  totalRow(`SGST @ ${doc.halfRatePercent}%`, inr(doc.sgstMinor));
  page.drawLine({ start: { x: tx, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 1, color: GOLD });
  y -= 6;
  totalRow("Total", inr(doc.totalMinor), true);

  // Amount in words, beside the totals.
  let wy = totalsTop;
  text(page, "AMOUNT IN WORDS", M, wy, { size: 7, font: bold, color: MUTED });
  wy -= 13;
  for (const l of wrap(amountInWords(doc.totalMinor), reg, 9, tx - M - 30)) {
    text(page, l, M, wy, { size: 9 });
    wy -= 12;
  }
  y = Math.min(y, wy) - 18;

  // ── Payment ───────────────────────────────────────────────────────────
  const paid = doc.payment.status === "paid";
  const boxH = 46;
  page.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, borderColor: paid ? GREEN : GOLD, borderWidth: 1, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: M, y: y - boxH, width: 4, height: boxH, color: paid ? GREEN : GOLD });
  const waived = !paid && doc.cancelled;
  text(page, paid ? "PAID" : waived ? "NO PAYMENT DUE" : "PAY AT DESK", M + 16, y - 19, {
    size: 10,
    font: bold,
    color: paid ? GREEN : NAVY,
  });
  const payLine =
    doc.payment.status === "paid"
      ? [
          paymentMethodLabel(doc.payment.method) && `via ${paymentMethodLabel(doc.payment.method)}`,
          doc.payment.paidAt && `on ${istDay(doc.payment.paidAt)}`,
          doc.payment.reference && `Ref ${doc.payment.reference}`,
        ].filter(Boolean).join(" · ") || "Received with thanks"
      : waived
        ? "This booking was cancelled before payment"
        : doc.payment.note;
  text(page, payLine, M + 16, y - 34, { size: 8.5, color: MUTED });
  y -= boxH + 20;

  // ── Notes & footer ────────────────────────────────────────────────────
  const notes = [
    "Tax payable on reverse charge: No.",
    "This is a computer-generated document and needs no signature.",
  ];
  for (const n of notes) {
    text(page, n, M, y, { size: 8, color: MUTED });
    y -= 11;
  }

  page.drawLine({ start: { x: M, y: 58 }, end: { x: W - M, y: 58 }, thickness: 0.6, color: LINE });
  text(page, `${SELLER.tradeName} · ${SELLER.website}`, M, 42, { size: 8, color: MUTED });
  text(page, "Thank you for working with us.", W - M, 42, { size: 8, font: bold, color: GOLD, align: "right" });

  if (doc.cancelled) {
    page.drawText("CANCELLED", {
      x: 150,
      y: 330,
      size: 72,
      font: bold,
      color: RED,
      opacity: 0.12,
      rotate: degrees(30),
    });
  }

  return pdf.save();
}
