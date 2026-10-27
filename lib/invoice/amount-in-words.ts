// "Rupees One Lakh Twenty Thousand Only": the amount line Indian invoices carry,
// grouped the Indian way (thousand, lakh, crore).

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  return [h ? `${ONES[h]} Hundred` : "", belowHundred(n % 100)].filter(Boolean).join(" ");
}

function integerWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  const lakh = Math.floor((n % 1e7) / 1e5);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor((n % 1e5) / 1e3);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  const rest = n % 1e3;
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** An amount in paise, written out for the invoice. */
export function amountInWords(minor: number): string {
  const rupees = Math.floor(minor / 100);
  const paise = minor % 100;
  const words = `Rupees ${integerWords(rupees)}`;
  return paise ? `${words} and ${belowHundred(paise)} Paise Only` : `${words} Only`;
}
