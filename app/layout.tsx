import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Collabix · Work Lounge",
  description:
    "Collabix Work Lounge — a premium managed office and coworking space in Banaswadi, Bengaluru. Where serious work happens.",
  metadataBase: new URL("https://collabix.com"),
  openGraph: {
    title: "Collabix · Work Lounge",
    description:
      "A premium managed work lounge in Banaswadi, Bengaluru. Where serious work happens.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1F3A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
