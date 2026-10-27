import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  // The invoice PDF reads its fonts and logo from disk at request time.
  outputFileTracingIncludes: {
    "/account/invoices/[id]": ["./lib/invoice/fonts/*.ttf", "./public/logo-navy.png"],
  },
  // The site used to live under /home while / showed a coming-soon page.
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/home/:path*", destination: "/:path*", permanent: true },
      // The booking page moved from /booking to /book (2026-10-26). Keep the
      // old path alive for shared links and for Cashfree return URLs issued
      // before the move; Next forwards the query string (order_id) as well.
      { source: "/booking", destination: "/book", permanent: true },
      { source: "/booking/:path*", destination: "/book/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
