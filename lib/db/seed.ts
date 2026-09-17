// Placeholder inventory for local dev, matching the spec: 12 desks, 2 cabins,
// 1 meeting room, plus the four demo rate plans. Real inventory replaces this
// before launch (see docs/coworking-architecture.md — the 120-vs-12 seat
// conflict is unresolved). Single source of truth: the integration-test harness
// imports seedInventory from here too.

import * as schema from "./schema";
import type { Db } from "../domain/reservations";

export async function seedInventory(db: Db) {
  const [loc] = await db
    .insert(schema.location)
    .values({ name: "Collabix (seed)", timezone: "Asia/Kolkata" })
    .returning();
  const [fl] = await db
    .insert(schema.floor)
    .values({ locationId: loc.id, name: "Ground" })
    .returning();
  const [deskZone] = await db
    .insert(schema.zone)
    .values({ floorId: fl.id, name: "Open desks", kind: "desk_bank" })
    .returning();
  const [cabinZone] = await db
    .insert(schema.zone)
    .values({ floorId: fl.id, name: "Cabins", kind: "room" })
    .returning();
  const [meetingZone] = await db
    .insert(schema.zone)
    .values({ floorId: fl.id, name: "Meeting", kind: "room" })
    .returning();

  const desks = Array.from({ length: 12 }, (_, i) => ({
    zoneId: deskZone.id,
    code: `D-${String(i + 1).padStart(2, "0")}`,
    kind: "desk" as const,
    capacity: 1,
    x: (i % 6) + 1,
    y: Math.floor(i / 6) + 1,
  }));
  const cabins = [1, 2].map((n) => ({
    zoneId: cabinZone.id,
    code: `C-${String(n).padStart(2, "0")}`,
    kind: "room" as const,
    capacity: 4,
  }));
  const meeting = [
    { zoneId: meetingZone.id, code: "M-01", kind: "room" as const, capacity: 8 },
  ];
  await db.insert(schema.resource).values([...desks, ...cabins, ...meeting]);

  await db.insert(schema.ratePlan).values([
    { key: "hotdesk", name: "Hot Desk", appliesToKind: "desk", rateMinor: 12000 },
    { key: "dedicated", name: "Dedicated Desk", appliesToKind: "desk", rateMinor: 20000 },
    { key: "cabin", name: "Private Cabin", appliesToKind: "room", rateMinor: 60000 },
    { key: "meeting", name: "Meeting Room", appliesToKind: "room", rateMinor: 90000 },
  ]);
}

// CLI entry: `npm run db:seed`. Clears inventory + bookings, then re-seeds.
async function main() {
  const { db, sql } = await import("./client");
  await sql`TRUNCATE TABLE "reservation","booking","resource","rate_plan","zone","floor","location" RESTART IDENTITY CASCADE`;
  await seedInventory(db);
  await sql.end();
  console.log("Seeded 12 desks, 2 cabins, 1 meeting room and 4 rate plans.");
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
