import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  // The site used to live under /home while / showed a coming-soon page.
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/home/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
