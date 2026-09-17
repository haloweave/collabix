import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

// Single shared connection pool. postgres-js is safe to reuse across requests.
export const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });
export type Db = typeof db;
