// One-off, idempotent data migration that brings an existing database (e.g.
// production) onto the tariff: inventory from lib/floorplan.ts, rate-plan
// registry from lib/tariff.ts. Unlike the seed it never truncates or deletes:
// surplus resources and the old demo plans are switched off, so past bookings
// keep their seats and plan names. Run with `npm run db:tariff` BEFORE the
// code that sells tariff products goes live, or holds fail with unknown_plan.

import { eq, inArray, notInArray } from "drizzle-orm";
import * as schema from "./schema";
import type { Db, Tx } from "../domain/reservations";
import { seats } from "../floorplan";
import { REGISTRY_PLANS } from "../tariff";

const OLD_PLAN_KEYS = ["hotdesk", "dedicated", "cabin", "meeting"];

/** All-or-nothing: a failure part-way leaves the database as it was. */
export async function migrateToTariff(db: Db): Promise<string[]> {
  return db.transaction((tx) => migrate(tx));
}

async function migrate(db: Tx): Promise<string[]> {
  const log: string[] = [];
  const all = seats();

  await db
    .update(schema.location)
    .set({ name: "Collabix Work Lounge" })
    .where(eq(schema.location.name, "Collabix (seed)"));

  const [floor] = await db.select().from(schema.floor).limit(1);
  if (!floor) throw new Error("no floor found — seed the database first");

  // Zones by name, creating any the floor plan needs.
  const zones = await db.select().from(schema.zone);
  const zoneIdByName = new Map(zones.map((z) => [z.name, z.id]));
  for (const name of new Set(all.map((s) => s.zone))) {
    if (zoneIdByName.has(name)) continue;
    const kind = all.some((s) => s.zone === name && s.kind === "desk") ? "desk_bank" : "room";
    const [z] = await db.insert(schema.zone).values({ floorId: floor.id, name, kind }).returning();
    zoneIdByName.set(name, z.id);
    log.push(`zone added: ${name}`);
  }

  // Resources: add missing, re-enable any listed, disable the rest.
  const existing = new Map((await db.select().from(schema.resource)).map((r) => [r.code, r]));
  for (const s of all) {
    const row = existing.get(s.code);
    if (!row) {
      await db.insert(schema.resource).values({
        zoneId: zoneIdByName.get(s.zone)!,
        code: s.code,
        kind: s.kind,
        capacity: s.capacity,
        x: Math.round(s.x),
        y: Math.round(s.y),
      });
      log.push(`resource added: ${s.code}`);
    } else if (!row.enabled || row.capacity !== s.capacity) {
      await db
        .update(schema.resource)
        .set({ enabled: true, capacity: s.capacity })
        .where(eq(schema.resource.id, row.id));
      log.push(`resource updated: ${s.code}`);
    }
  }
  const disabled = await db
    .update(schema.resource)
    .set({ enabled: false })
    .where(notInArray(schema.resource.code, all.map((s) => s.code)))
    .returning({ code: schema.resource.code, wasEnabled: schema.resource.enabled });
  const newlyDisabled = disabled.map((r) => r.code).filter((c) => existing.get(c)?.enabled);
  if (newlyDisabled.length) log.push(`resources disabled: ${newlyDisabled.join(", ")}`);

  // Rate-plan registry: old demo plans off, tariff rows upserted.
  const plans = new Map((await db.select().from(schema.ratePlan)).map((p) => [p.key, p]));
  const toRetire = OLD_PLAN_KEYS.filter((k) => plans.get(k)?.active);
  if (toRetire.length) {
    await db.update(schema.ratePlan).set({ active: false }).where(inArray(schema.ratePlan.key, toRetire));
    log.push(`plans retired: ${toRetire.join(", ")}`);
  }
  for (const want of REGISTRY_PLANS) {
    const have = plans.get(want.key);
    if (!have) {
      await db.insert(schema.ratePlan).values(want);
      log.push(`plan added: ${want.key}`);
    } else if (
      have.name !== want.name ||
      have.rateMinor !== want.rateMinor ||
      have.active !== want.active ||
      have.appliesToKind !== want.appliesToKind
    ) {
      await db
        .update(schema.ratePlan)
        .set({ name: want.name, rateMinor: want.rateMinor, active: want.active, appliesToKind: want.appliesToKind })
        .where(eq(schema.ratePlan.id, have.id));
      log.push(`plan updated: ${want.key}`);
    }
  }
  return log;
}

async function main() {
  await import("dotenv/config"); // load DATABASE_URL before the client connects
  const { db, sql } = await import("./client");
  const log = await migrateToTariff(db);
  await sql.end();
  console.log(log.length ? log.join("\n") : "Already on the tariff — nothing to change.");
}

if (process.argv[1] && process.argv[1].endsWith("migrate-tariff.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
