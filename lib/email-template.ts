// The branded shell every customer email shares: navy header, a details table
// and an optional gold button. Plain inline styles, since mail clients strip
// <style> blocks.

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailBody = {
  /** Big header line, e.g. "You're booked in". */
  heading: string;
  /** Opening paragraph (plain text; escaped). */
  intro: string;
  /** Label/value rows shown as a table. */
  details?: [string, string][];
  /** Raw HTML placed between the intro and the details (already safe). */
  extraHtml?: string;
  cta?: { label: string; url: string };
  /** Closing paragraph (plain text; escaped). */
  outro?: string;
  footer: string;
};

export function brandedEmailHtml(b: EmailBody): string {
  const details = b.details?.length
    ? `<table style="width:100%;font-size:14px;text-align:left;border-collapse:collapse">
      ${b.details.map(([k, v]) => `<tr><td style="color:#4A4F58;padding:4px 0">${esc(k)}</td><td style="text-align:right;font-weight:600">${esc(v)}</td></tr>`).join("")}
    </table>`
    : "";
  const cta = b.cta
    ? `<a href="${esc(b.cta.url)}" style="display:inline-block;margin-top:20px;background:#C89B53;color:#0B1F3A;padding:12px 20px;border-radius:999px;font-weight:600;text-decoration:none">${esc(b.cta.label)}</a>`
    : "";
  const outro = b.outro ? `<p style="margin:20px 0 0;font-size:14px">${esc(b.outro)}</p>` : "";
  return `
<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0B1F3A">
  <div style="background:#0B1F3A;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0">
    <div style="color:#C89B53;font-size:12px;letter-spacing:.2em;text-transform:uppercase">Collabix Work Lounge</div>
    <div style="font-size:20px;font-weight:600;margin-top:4px">${esc(b.heading)}</div>
  </div>
  <div style="border:1px solid #D9D6D1;border-top:0;border-radius:0 0 16px 16px;padding:24px;text-align:center">
    <p style="margin:0 0 16px">${esc(b.intro)}</p>
    ${b.extraHtml ?? ""}
    ${details}
    ${cta}
    ${outro}
    <p style="font-size:12px;color:#4A4F58;margin-top:20px">${esc(b.footer)}</p>
  </div>
</div>`;
}

/** The plain-text twin of brandedEmailHtml. */
export function brandedEmailText(b: EmailBody & { greeting: string }): string {
  return [
    b.greeting,
    "",
    b.intro,
    ...(b.details?.length ? ["", ...b.details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(b.cta ? ["", `${b.cta.label}: ${b.cta.url}`] : []),
    ...(b.outro ? ["", b.outro] : []),
    "",
    "Collabix Work Lounge",
    b.footer,
  ].join("\n");
}
