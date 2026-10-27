// Seed (or update) a staff account that signs in with email + password.
//
//   LOGIN_EMAIL=staff@collabix.co.in LOGIN_PASSWORD='…' LOGIN_ROLE=staff \
//     LOGIN_NAME="Front desk" npm run db:seed:login
//
// Public password sign-up is disabled (lib/auth.ts), so this is the only way a
// password account comes to exist. Creates the user with the given role and a
// Better Auth "credential" account holding the hashed password. Re-running sets
// the role and resets the password (idempotent).

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import * as authSchema from "./auth-schema";

const ROLES = ["owner", "manager", "staff", "reception"];

async function main() {
  await import("dotenv/config");
  const { db, sql } = await import("./client");

  const email = (process.env.LOGIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.LOGIN_PASSWORD ?? "";
  const role = (process.env.LOGIN_ROLE ?? "").trim();
  const name = process.env.LOGIN_NAME?.trim() || email.split("@")[0];
  if (!email) throw new Error("Set LOGIN_EMAIL.");
  if (password.length < 8) throw new Error("Set LOGIN_PASSWORD (at least 8 characters).");
  if (!ROLES.includes(role)) throw new Error(`Set LOGIN_ROLE to one of: ${ROLES.join(", ")}.`);

  const hash = await hashPassword(password);
  const now = new Date();

  await db.transaction(async (tx) => {
    let [u] = await tx.select().from(authSchema.user).where(eq(authSchema.user.email, email));
    if (u) {
      await tx.update(authSchema.user).set({ role, updatedAt: now }).where(eq(authSchema.user.id, u.id));
    } else {
      [u] = await tx
        .insert(authSchema.user)
        .values({ id: randomUUID(), name, email, emailVerified: true, role })
        .returning();
    }

    const credential = and(eq(authSchema.account.userId, u.id), eq(authSchema.account.providerId, "credential"));
    const [acc] = await tx.select().from(authSchema.account).where(credential);
    if (acc) {
      await tx.update(authSchema.account).set({ password: hash, updatedAt: now }).where(eq(authSchema.account.id, acc.id));
    } else {
      await tx.insert(authSchema.account).values({
        id: randomUUID(),
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password: hash,
      });
    }
    console.log(`${u.email} is ${role} with a password. Sign in at /login.`);
  });

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
