import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema";

// Venue-wide settings (single row, id=1). Read on the booking path to govern
// tax, bookable hours and closures; falls back to defaults if the row is absent.
export type VenueSettings = {
  taxPercent: number;
  openHour: number;
  closeHour: number;
  timezone: string;
  closedDates: string[];
};

export const DEFAULT_SETTINGS: VenueSettings = {
  taxPercent: 18,
  openHour: 8,
  closeHour: 20,
  timezone: "Asia/Kolkata",
  closedDates: [],
};

export async function getSettings(
  db: PostgresJsDatabase<typeof schema>,
): Promise<VenueSettings> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1));
  if (!row) return DEFAULT_SETTINGS;
  return {
    taxPercent: row.taxPercent,
    openHour: row.openHour,
    closeHour: row.closeHour,
    timezone: row.timezone,
    closedDates: (row.closedDates as string[]) ?? [],
  };
}
