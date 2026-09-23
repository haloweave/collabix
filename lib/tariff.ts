/** Collabix Membership & Services Tariff 2026 — the published rate card.
 * Prices are whole rupees before 18% GST. These are the advertised plan prices
 * for the marketing pages; online hourly booking still quotes from the DB rate
 * plans (see lib/rates.ts). */

export const EARLY_BIRD_DEADLINE = "15th Oct 2026";

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
  note?: string;
};

const earlyBird = `Early Bird: attractive offers for booking before ${EARLY_BIRD_DEADLINE}.`;

export const tariff: TariffSection[] = [
  {
    id: "desks",
    title: "Shared Desks",
    subtitle: "28 desks · Mon–Sat, 08:00–20:00 IST",
    unit: "month",
    rows: [
      { name: "Hot Desk Flexi", includes: "Any desk + 10 pages of prints", standard: 6000, earlyBird: 5400, annual: 72000 },
      { name: "Dedicated Desk", includes: "Fixed seat + locker + 2 credits + 20 pages of prints", standard: 8500, earlyBird: 7700, annual: 102000 },
      { name: "Dedicated Desk Pro", includes: "Fixed seat + locker + 4 credits + 1 guest pass + 30 pages of prints", standard: 10000, earlyBird: 9000, annual: 120000 },
    ],
    note: `${earlyBird} Annual plans: 15% off + 50% waiver on security deposit.`,
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
    note: `${earlyBird} Annual plans: 15% off + 50% waiver on security deposit.`,
  },
  {
    id: "meeting",
    title: "Meeting Rooms",
    unit: "hour",
    rows: [
      { name: "Meeting Room (4-seater)", includes: "Compact meeting room + TV + whiteboard", standard: 350, earlyBird: 300 },
      { name: "The Boardroom", includes: "8 seats, integrated VC, interactive panel", standard: 750, earlyBird: 700 },
    ],
    note: earlyBird,
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
    note: `${earlyBird} Annual plans: 15% off. Minimum 1-year lock-in.`,
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
    note: earlyBird,
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
