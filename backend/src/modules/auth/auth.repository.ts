import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { UserRow } from "../../db/types";

export function findUserByEmail(email: string, trx: Knex | Knex.Transaction = db): Promise<UserRow | undefined> {
  return trx<UserRow>("users").where({ email }).first();
}

export function findUserById(id: string, trx: Knex | Knex.Transaction = db): Promise<UserRow | undefined> {
  return trx<UserRow>("users").where({ id }).first();
}

export async function createUserWithWallet(
  input: { email: string; passwordHash: string; fullName: string | null },
  currency: string
): Promise<UserRow> {
  return db.transaction(async (trx) => {
    const [user] = await trx<UserRow>("users")
      .insert({ email: input.email, password_hash: input.passwordHash, full_name: input.fullName })
      .returning("*");
    if (!user) throw new Error("Failed to create user");

    await trx("wallets").insert({ user_id: user.id, balance: 0, currency });

    return user;
  });
}

export function createSession(
  input: { userId: string; tokenHash: string; expiresAt: Date; userAgent: string | null; ipAddress: string | null }
): Promise<void> {
  return db("sessions").insert({
    user_id: input.userId,
    token_hash: input.tokenHash,
    expires_at: input.expiresAt,
    user_agent: input.userAgent,
    ip_address: input.ipAddress,
  });
}

export function revokeSessionByTokenHash(tokenHash: string): Promise<number> {
  return db("sessions").where({ token_hash: tokenHash }).whereNull("revoked_at").update({ revoked_at: new Date() });
}

export function registerFailedLogin(
  userId: string,
  maxAttempts: number,
  lockoutMinutes: number
): Promise<void> {
  return db.transaction(async (trx) => {
    const user = await trx<UserRow>("users").where({ id: userId }).forUpdate().first();
    if (!user) return;
    const attempts = user.failed_login_attempts + 1;
    const update: Partial<UserRow> = { failed_login_attempts: attempts };
    if (attempts >= maxAttempts) {
      update.locked_until = new Date(Date.now() + lockoutMinutes * 60_000);
    }
    await trx("users").where({ id: userId }).update(update);
  });
}

export function resetFailedLogin(userId: string): Promise<number> {
  return db("users").where({ id: userId }).update({ failed_login_attempts: 0, locked_until: null });
}

export function isLocked(user: Pick<UserRow, "locked_until">): boolean {
  return Boolean(user.locked_until && user.locked_until.getTime() > Date.now());
}
