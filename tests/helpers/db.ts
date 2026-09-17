// Integration-test harness: a real Postgres (the Docker one), migrated and
// seeded with placeholder inventory. Concurrency correctness cannot be tested
// against a mock, so these tests talk to the actual database.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql as drizzleSql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../../lib/db/schema";
import { seedInventory } from "../../lib/db/seed";

export { seedInventory };

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set for integration tests");
  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });
  return { client, db };
}

export async function migrateDb(db: TestDb) {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

/** Wipe bookings/reservations between tests; inventory + rate plans persist. */
export async function resetBookings(db: TestDb) {
  await db.execute(
    drizzleSql`TRUNCATE TABLE "reservation", "booking" RESTART IDENTITY CASCADE`,
  );
}
