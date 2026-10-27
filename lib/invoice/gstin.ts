// GSTIN: 2-digit state code + PAN (5 letters, 4 digits, 1 letter) + entity
// number + "Z" + a mod-36 check character.

const SHAPE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const normalizeGstin = (v: string) => v.replace(/\s+/g, "").toUpperCase();

function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** True for a well-formed GSTIN whose check character matches. */
export function isValidGstin(v: string): boolean {
  const g = normalizeGstin(v);
  return SHAPE.test(g) && checkChar(g.slice(0, 14)) === g[14];
}
