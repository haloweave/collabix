import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

// Single shared connection pool. postgres-js is safe to reuse across requests.
// `prepare: false` is required for Supabase's transaction-mode pooler (port
// 6543, used on serverless/Vercel), which does not support prepared statements.
// It is harmless on a direct/session connection, so we set it unconditionally.
// TLS for hosted Postgres is negotiated from the URL (append `?sslmode=require`).
export const sql = postgres(connectionString, { prepare: false });
export const db = drizzle(sql, { schema });
export type Db = typeof db;
