import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as schema from "../lib/db/schema";
import { migrateToTariff } from "../lib/db/migrate-tariff";
import { makeClient, migrateDb, resetBookings, type TestDb } from "./helpers/db";

let db: TestDb;
let client: ReturnType<typeof makeClient>["client"];

beforeAll(async () => {
  ({ db, client } = makeClient());
  await migrateDb(db);
});

afterAll(async () => {
  await client.end();
});

/** The pre-tariff inventory production was seeded with: 44 desks, one meeting
 * room, two cabins and the four demo hourly plans. */
async function seedOldInventory() {
  await resetBookings(db);
  await client`TRUNCATE TABLE "resource","rate_plan","zone","floor","location" RESTART IDENTITY CASCADE`;
  const [loc] = await db.insert(schema.location).values({ name: "Collabix (seed)", timezone: "Asia/Kolkata" }).returning();
  const [fl] = await db.insert(schema.floor).values({ locationId: loc.id, name: "Ground" }).returning();
  const zone = async (name: string, kind: "desk_bank" | "room") =>
    (await db.insert(schema.zone).values({ floorId: fl.id, name, kind }).returning())[0].id;
  const desks = await zone("Open desks", "desk_bank");
  const meeting = await zone("Meeting", "room");
  const cabins = await zone("Cabins", "room");
  await db.insert(schema.resource).values([
    ...Array.from({ length: 44 }, (_, i) => ({
      zoneId: desks,
      code: `D-${String(i + 1).padStart(2, "0")}`,
      kind: "desk" as const,
      capacity: 1,
    })),
    { zoneId: meeting, code: "M-01", kind: "room" as const, capacity: 8 },
    { zoneId: cabins, code: "C-01", kind: "room" as const, capacity: 4 },
    { zoneId: cabins, code: "C-02", kind: "room" as const, capacity: 4 },
  ]);
  await db.insert(schema.ratePlan).values([
    { key: "hotdesk", name: "Hot Desk", appliesToKind: "desk", rateMinor: 12000 },
    { key: "dedicated", name: "Dedicated Desk", appliesToKind: "desk", rateMinor: 20000 },
    { key: "cabin", name: "Private Cabin", appliesToKind: "room", rateMinor: 60000 },
    { key: "meeting", name: "Meeting Room", appliesToKind: "room", rateMinor: 90000 },
  ]);
}

describe("migrateToTariff on the old production inventory", () => {
  test("brings inventory and plans onto the tariff, then has nothing left to do", async () => {
    await seedOldInventory();
    const first = await migrateToTariff(db);
    expect(first.length).toBeGreaterThan(0);

    const resources = await db.select().from(schema.resource);
    const enabled = resources.filter((r) => r.enabled);
    expect(enabled.filter((r) => r.kind === "desk")).toHaveLength(28);
    expect(enabled.filter((r) => r.kind === "room").map((r) => r.code).sort())
      .toEqual(["C-01", "C-02", "C-03", "C-04", "M-01", "M-02"]);
    // Nothing is deleted: the 16 surplus desks are only switched off.
    expect(resources).toHaveLength(44 + 3 + 3);

    const plans = new Map((await db.select().from(schema.ratePlan)).map((p) => [p.key, p]));
    for (const old of ["hotdesk", "dedicated", "cabin", "meeting"]) expect(plans.get(old)?.active).toBe(false);
    expect(plans.get("day-full")).toMatchObject({ active: true, rateMinor: 39900 });
    expect(plans.get("boardroom")).toMatchObject({ active: true, rateMinor: 75000 });
    expect(plans.get("desk-membership")?.active).toBe(false);

    const [loc] = await db.select().from(schema.location);
    expect(loc.name).toBe("Collabix Work Lounge");

    expect(await migrateToTariff(db)).toEqual([]);
  });
});
