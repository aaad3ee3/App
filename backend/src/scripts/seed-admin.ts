/**
 * Bootstraps the first admin account. There is deliberately no public API endpoint that
 * can promote a user to admin — run this once against the target environment instead:
 *
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=... npm run seed:admin
 */
import argon2 from "argon2";
import { db } from "../db/knex";
import { env } from "../config/env";
import { DEFAULT_CURRENCY } from "../config/constants";
import type { UserRow } from "../db/types";

async function main() {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in the environment before running this script.");
    process.exitCode = 1;
    return;
  }

  const existing = await db<UserRow>("users").where({ email }).first();
  if (existing) {
    if (existing.is_admin) {
      console.log(`${email} is already an admin — nothing to do.`);
      return;
    }
    await db("users").where({ id: existing.id }).update({ is_admin: true, updated_at: new Date() });
    console.log(`Promoted existing user ${email} to admin.`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await db.transaction(async (trx) => {
    const [u] = await trx<UserRow>("users")
      .insert({ email, password_hash: passwordHash, is_admin: true })
      .returning("*");
    if (!u) throw new Error("Failed to create admin user");
    await trx("wallets").insert({ user_id: u.id, balance: 0, currency: DEFAULT_CURRENCY });
    return u;
  });

  console.log(`Created admin user ${user.email} (id: ${user.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
