/** Collabix Membership & Services Tariff 2026 — the published rate card.
 * Prices are whole rupees before 18% GST. This file is the single source of
 * truth: /pricing renders these rows, and online and walk-in booking price
 * from the BOOKABLE catalogue below, which reads the same rows. */

export const EARLY_BIRD_DEADLINE = "15th Oct 2026";
/** First day (IST) the Early Bird offer no longer applies. Move this, and the
 * label above, to run the offer again. */
const EARLY_BIRD_ENDS_ON = "2026-10-15";

/** Early Bird prices show only while the offer is open, so an expired offer
 * never stays on the site. */
export function earlyBirdOpen(now = new Date()): boolean {
  const todayIst = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return todayIst < EARLY_BIRD_ENDS_ON;
}

export const earlyBirdNote = `Early Bird: attractive offers for booking before ${EARLY_BIRD_DEADLINE}.`;

export type TariffRow = {
  name: string;
  includes: string;
  standard: number;
  earlyBird?: number;
  annual?: number;
};

export type TariffSection = {
  id: string;
  title: string;
  subtitle?: string;
  /** Column headers for the price columns, in order: standard, early bird, annual. */
  unit: "month" | "hour" | "day" | "service";
  rows: TariffRow[];
  /** Terms that hold whether or not the Early Bird offer is open. */
  note?: string;
};

export const tariff: TariffSection[] = [
  {
    id: "desks",
    title: "Shared Desks",
    subtitle: "28 desks · Open 24/7",
    unit: "month",
    rows: [
      { name: "Hot Desk Flexi", includes: "Any desk + 10 pages of prints", standard: 6000, earlyBird: 5400, annual: 72000 },
      { name: "Dedicated Desk", includes: "Fixed seat + locker + 2 credits + 20 pages of prints", standard: 8500, earlyBird: 7700, annual: 102000 },
      { name: "Dedicated Desk Pro", includes: "Fixed seat + locker + 4 credits + 1 guest pass + 30 pages of prints", standard: 10000, earlyBird: 9000, annual: 120000 },
    ],
    note: "Annual plans: 15% off + 50% waiver on security deposit.",
  },
  {
    id: "cabins",
    title: "Private Cabins",
    subtitle: "4 people per cabin",
    unit: "month",
    rows: [
      { name: "Cabin · Base", includes: "Standard fit-out + 30 pages of prints", standard: 24000, earlyBird: 21600, annual: 288000 },
      { name: "Cabin · Pro", includes: "Standard fit-out + 2 credits + 30 pages of prints", standard: 34000, earlyBird: 30800, annual: 408000 },
      { name: "Cabin · Enterprise", includes: "Standard fit-out + 4 credits + 2 guest passes + 30 pages of prints", standard: 40000, earlyBird: 36000, annual: 480000 },
    ],
    note: "Annual plans: 15% off + 50% waiver on security deposit.",
  },
  {
    id: "meeting",
    title: "Meeting Rooms",
    unit: "hour",
    rows: [
      { name: "Meeting Room (4-seater)", includes: "Compact meeting room + TV + whiteboard", standard: 350, earlyBird: 300 },
      { name: "The Boardroom", includes: "8 seats, integrated VC, interactive panel", standard: 750, earlyBird: 700 },
    ],
  },
  {
    id: "virtual",
    title: "Virtual Office",
    unit: "month",
    rows: [
      { name: "Address Only", includes: "Business address + mail notification", standard: 1100, earlyBird: 999, annual: 13200 },
      { name: "Address + GST", includes: "Business address + GST NOC + 2 credits + mail notification / pouch*", standard: 2000, earlyBird: 1799, annual: 24000 },
      { name: "Virtual Pro", includes: "Business address + GST NOC + display + 4 credits + mail notification / pouch*", standard: 3300, earlyBird: 2999, annual: 39600 },
    ],
    note: "Annual plans: 15% off. Minimum 1-year lock-in.",
  },
  {
    id: "passes",
    title: "Day Passes & Corporate Bundles",
    unit: "day",
    rows: [
      { name: "Full Day Pass", includes: "Single day, per person, all shared-desk access", standard: 399, earlyBird: 375 },
      { name: "Half Day Pass", includes: "4-hour block", standard: 199, earlyBird: 175 },
      { name: "Weekly Pass", includes: "4 people, 6 consecutive days", standard: 1499, earlyBird: 1400 },
      { name: "Corporate Bundle (6-pack)", includes: "6 accesses, anybody / anytime + 6 credits", standard: 375, earlyBird: 350 },
      { name: "Corporate Bundle (8-pack)", includes: "8 accesses, anybody / anytime + 8 credits", standard: 375, earlyBird: 350 },
      { name: "Corporate Bundle (10-pack)", includes: "10 accesses, anybody / anytime + 10 credits", standard: 375, earlyBird: 350 },
    ],
  },
  {
    id: "services",
    title: "Happy to Help Service Desk",
    subtitle: "GST · Udyam · Incorporation",
    unit: "service",
    rows: [
      { name: "GST Registration", includes: "One-time", standard: 6000 },
      { name: "GST Filing · Nil", includes: "Per month", standard: 800 },
      { name: "GST Filing · Non-Nil", includes: "Per month", standard: 4000 },
      { name: "Quarterly Composition", includes: "Per quarter", standard: 6500 },
      { name: "Udyam Registration", includes: "One-time", standard: 6500 },
      { name: "Company / LLP Incorporation", includes: "One-time", standard: 15000 },
      { name: "Name Board Display", includes: "Per month, 6-month minimum", standard: 600 },
    ],
  },
];

export const tariffNotes = [
  "After hours (20:00–07:00 IST): 20% additional on the above.",
  "Agreement drafting, notary and postage at actuals.",
  "GST of 18% applies to all prices.",
  "* Courier charges on a to-pay basis through Bluedart.",
  "1 credit = 1 hour of meeting-room time.",
];

/* ---------- Bookable products ----------
 * What can be booked online or at the desk, priced straight from the tariff
 * rows above so /pricing and the booking logic can never disagree. */

export const GST_RATE = 0.18;
/** Tariff note: 20:00–07:00 IST is 20% additional. Applies to hourly rooms. */
export const NIGHT_SURCHARGE = 0.2;
export const NIGHT_FROM = 20;
export const NIGHT_UNTIL = 7;

export type ProductKey = "day-full" | "day-half" | "meeting-4" | "boardroom";
export const PRODUCT_KEYS = ["day-full", "day-half", "meeting-4", "boardroom"] as const satisfies readonly [ProductKey, ...ProductKey[]];

export type BookableProduct = {
  key: ProductKey;
  name: string;
  blurb: string;
  kind: "pass" | "room";
  unit: "person" | "hour";
  priceMinor: number;
  earlyBirdMinor: number | null;
  roomCode: "M-01" | "M-02" | null;
};

function tariffRow(sectionId: string, name: string): TariffRow {
  const row = tariff.find((s) => s.id === sectionId)?.rows.find((r) => r.name === name);
  if (!row) throw new Error(`tariff row missing: ${sectionId} / ${name}`);
  return row;
}

function product(
  key: ProductKey,
  sectionId: string,
  rowName: string,
  rest: Pick<BookableProduct, "kind" | "unit" | "roomCode">,
): BookableProduct {
  const row = tariffRow(sectionId, rowName);
  return {
    key,
    name: row.name,
    blurb: row.includes,
    priceMinor: row.standard * 100,
    earlyBirdMinor: row.earlyBird != null ? row.earlyBird * 100 : null,
    ...rest,
  };
}

export const BOOKABLE: readonly BookableProduct[] = [
  product("day-full", "passes", "Full Day Pass", { kind: "pass", unit: "person", roomCode: null }),
  product("day-half", "passes", "Half Day Pass", { kind: "pass", unit: "person", roomCode: null }),
  product("meeting-4", "meeting", "Meeting Room (4-seater)", { kind: "room", unit: "hour", roomCode: "M-02" }),
  product("boardroom", "meeting", "The Boardroom", { kind: "room", unit: "hour", roomCode: "M-01" }),
];

export function bookableProduct(key: string): BookableProduct | undefined {
  return BOOKABLE.find((p) => p.key === key);
}

/** The price that applies now: Early Bird while the offer is open, else standard. */
export function productPriceMinor(p: BookableProduct, now = new Date()): number {
  return earlyBirdOpen(now) && p.earlyBirdMinor != null ? p.earlyBirdMinor : p.priceMinor;
}

/** The rate_plan rows reservations reference: one per bookable product, plus
 * two never-sold rows for member holds and extended bookings. Prices are
 * recorded for reference only; quotes always come from BOOKABLE. */
export const REGISTRY_PLANS: {
  key: string;
  name: string;
  appliesToKind: "desk" | "room";
  rateMinor: number;
  active: boolean;
}[] = [
  ...BOOKABLE.map((p) => ({
    key: p.key,
    name: p.name,
    appliesToKind: p.kind === "pass" ? ("desk" as const) : ("room" as const),
    rateMinor: p.priceMinor,
    active: true,
  })),
  { key: "desk-membership", name: "Desk (membership)", appliesToKind: "desk", rateMinor: 0, active: false },
  { key: "cabin-membership", name: "Private Cabin (membership)", appliesToKind: "room", rateMinor: 0, active: false },
];
