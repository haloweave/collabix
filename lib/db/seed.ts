// Inventory for local dev, derived from the real floor plan. lib/floorplan.ts is
// the single source of truth for the seats and their positions; this script just
// materialises them as DB rows (zones → resources) so the map and inventory stay
// in lockstep. The integration-test harness imports seedInventory from here too.

import * as schema from "./schema";
import type { Db } from "../domain/reservations";
import { seats } from "../floorplan";

export async function seedInventory(db: Db) {
  const [loc] = await db
    .insert(schema.location)
    .values({ name: "Collabix (seed)", timezone: "Asia/Kolkata" })
    .returning();
  const [fl] = await db
    .insert(schema.floor)
    .values({ locationId: loc.id, name: "Ground" })
    .returning();

  const all = seats();

  // One zone per distinct seat.zone; a zone holding any desk is a desk_bank.
  const zoneNames = [...new Set(all.map((s) => s.zone))];
  const zoneIdByName = new Map<string, string>();
  for (const name of zoneNames) {
    const kind = all.some((s) => s.zone === name && s.kind === "desk")
      ? "desk_bank"
      : "room";
    const [z] = await db
      .insert(schema.zone)
      .values({ floorId: fl.id, name, kind })
      .returning();
    zoneIdByName.set(name, z.id);
  }

  await db.insert(schema.resource).values(
    all.map((s) => ({
      zoneId: zoneIdByName.get(s.zone)!,
      code: s.code,
      kind: s.kind,
      capacity: s.capacity,
      x: Math.round(s.x),
      y: Math.round(s.y),
    })),
  );

  await db.insert(schema.ratePlan).values([
    { key: "hotdesk", name: "Hot Desk", appliesToKind: "desk", rateMinor: 12000 },
    { key: "dedicated", name: "Dedicated Desk", appliesToKind: "desk", rateMinor: 20000 },
    { key: "cabin", name: "Private Cabin", appliesToKind: "room", rateMinor: 60000 },
    { key: "meeting", name: "Meeting Room", appliesToKind: "room", rateMinor: 90000 },
  ]);
}

// CLI entry: `npm run db:seed`. Clears inventory + bookings, then re-seeds.
async function main() {
  await import("dotenv/config"); // load DATABASE_URL before the client connects
  const { db, sql } = await import("./client");
  await sql`TRUNCATE TABLE "reservation","booking","resource","rate_plan","zone","floor","location" RESTART IDENTITY CASCADE`;
  await seedInventory(db);
  await sql.end();
  const all = seats();
  const desks = all.filter((s) => s.kind === "desk").length;
  const roomCount = all.filter((s) => s.kind === "room").length;
  console.log(
    `Seeded ${desks} desks and ${roomCount} rooms (from the floor plan) and 4 rate plans.`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
