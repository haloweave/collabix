// Seed (or promote) a single owner account for the admin panel.
//
//   OWNER_EMAIL=you@collabix.com OWNER_NAME="Deren" npm run db:seed:owner
//
// Admin auth is passwordless: the owner signs in with an email OTP. Better Auth
// looks the account up by email, so pre-creating the row with role=owner means
// the very first OTP sign-in already lands with full access. Re-running just
// promotes an existing account to owner (idempotent).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as authSchema from "./auth-schema";

async function main() {
  await import("dotenv/config");
  const { db, sql } = await import("./client");

  const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const name = process.env.OWNER_NAME?.trim() || "Owner";
  if (!email) {
    throw new Error("Set OWNER_EMAIL to the owner's email address.");
  }

  const [existing] = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email));

  if (existing) {
    await db
      .update(authSchema.user)
      .set({ role: "owner", updatedAt: new Date() })
      .where(eq(authSchema.user.id, existing.id));
    console.log(`Promoted existing account ${email} to owner.`);
  } else {
    await db.insert(authSchema.user).values({
      id: randomUUID(),
      name,
      email,
      emailVerified: true,
      role: "owner",
    });
    console.log(`Created owner account ${email}. Sign in at /admin/login.`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
