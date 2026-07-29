import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Collabix brand — Haloweave spec v1.0
        navy: "#0B1F3A",
        "navy-mid": "#162942",
        gold: "#C89B53",
        "gold-light": "#D9B97A",
        ivory: "#F7F5F2",
        "ivory-dark": "#EDE9E3",
        graphite: "#4A4F58",
        concrete: "#D9D6D1",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
