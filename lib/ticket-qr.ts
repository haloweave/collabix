import "server-only";
import QRCode from "qrcode";

// Absolute base for ticket links in QR codes and emails. SITE_URL overrides
// (set it to the HTTPS tunnel URL when testing on a phone in dev).
export function siteUrl(): string {
  return (process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const ticketUrl = (token: string) => `${siteUrl()}/t/${token}`;

const QR = {
  errorCorrectionLevel: "M" as const,
  margin: 1,
  color: { dark: "#0B1F3A", light: "#FFFFFF" },
};

export const ticketQrSvg = (token: string) =>
  QRCode.toString(ticketUrl(token), { ...QR, type: "svg" });

export const ticketQrPng = (token: string) =>
  QRCode.toBuffer(ticketUrl(token), { ...QR, type: "png", width: 480 });
