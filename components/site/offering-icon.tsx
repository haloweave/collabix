/** 24×24 line icon from a single SVG path, in the site's 1.6 stroke style. */
export function OfferingIcon({ d, size = 24 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
