"use client";
import { Moon, Sun } from "lucide-react";

// Shared with the pre-paint script in app/layout.tsx.
const KEY = "collabix-theme";

/** Header button that flips the marketing site between the classic navy
 *  theme and the all-light one. The icon is chosen in CSS from
 *  `html[data-theme]`, so the server render never mismatches. */
export default function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const light = root.getAttribute("data-theme") !== "light";
    if (light) root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    try { if (light) localStorage.setItem(KEY, "light"); else localStorage.removeItem(KEY); } catch {}
  };
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label="Switch between light and navy theme" title="Switch theme">
    <Sun className="ic-sun" size={17} aria-hidden="true" />
    <Moon className="ic-moon" size={17} aria-hidden="true" />
  </button>;
}
