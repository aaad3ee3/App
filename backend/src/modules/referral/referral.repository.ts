import crypto from "node:crypto";
import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { UserRow } from "../../db/types";

const UNIQUE_VIOLATION = "23505";

/** Eight base32-ish characters (Crockford alphabet minus lookalikes) — short enough to
 *  read aloud or type from a screenshot, with negligible collision odds at this scale. */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

/**
 * Returns the user's referral code, generating and persisting one on first use. Lazy
 * rather than assigned at signup: a code that's never shared costs nothing to not have,
 * and this keeps every account-creation path (email, Google) from needing to know about
 * referrals at all.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db<UserRow>("users").where({ id: userId }).first();
  if (!existing) throw new Error(`getOrCreateReferralCode: user ${userId} not found`);
  if (existing.referral_code) return existing.referral_code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      const [row] = await db<UserRow>("users")
        .where({ id: userId })
        .whereNull("referral_code")
        .update({ referral_code: code })
        .returning("referral_code");
      if (row?.referral_code) return row.referral_code;
      // Already set by a concurrent call between the read above and this update.
      const refreshed = await db<UserRow>("users").where({ id: userId }).first();
      if (refreshed?.referral_code) return refreshed.referral_code;
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === UNIQUE_VIOLATION) continue; // code collision, try another
      throw err;
    }
  }
  throw new Error("Failed to generate a unique referral code");
}

export function findUserByReferralCode(code: string): Promise<UserRow | undefined> {
  return db<UserRow>("users").whereRaw("upper(referral_code) = upper(?)", [code.trim()]).first();
}

export function countReferrals(userId: string): Promise<number> {
  return db("users")
    .where({ referred_by: userId })
    .count<{ count: string }[]>("id as count")
    .then((rows) => Number(rows[0]?.count ?? 0));
}

export function sumReferralBonusEarned(userId: string): Promise<number> {
  return db("wallet_transactions")
    .where({ user_id: userId, type: "referral_bonus" })
    .sum<{ sum: string | null }[]>("amount as sum")
    .then((rows) => Number(rows[0]?.sum ?? 0));
}

export function lockUserForReferralReward(userId: string, trx: Knex.Transaction): Promise<UserRow | undefined> {
  return trx<UserRow>("users").where({ id: userId }).forUpdate().first();
}

export function countCompletedOrders(userId: string, trx: Knex | Knex.Transaction = db): Promise<number> {
  return trx("orders")
    .where({ user_id: userId, status: "completed" })
    .count<{ count: string }[]>("id as count")
    .then((rows) => Number(rows[0]?.count ?? 0));
}

export function markReferralBonusCredited(userId: string, trx: Knex.Transaction): Promise<number> {
  return trx("users").where({ id: userId }).update({ referral_bonus_credited_at: new Date() });
}
