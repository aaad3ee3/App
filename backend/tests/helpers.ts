import { db } from "../src/db/knex";
import { DEFAULT_CURRENCY } from "../src/config/constants";
import type { UserRow, WalletRow } from "../src/db/types";

export async function resetDb(): Promise<void> {
  await db.raw(
    `TRUNCATE TABLE admin_actions, wallet_transactions, sms_events, topup_requests, sessions, wallets, users RESTART IDENTITY CASCADE`
  );
}

let userCounter = 0;

export async function createTestUser(overrides: Partial<Pick<UserRow, "email" | "is_admin">> = {}): Promise<{
  user: UserRow;
  wallet: WalletRow;
}> {
  userCounter += 1;
  const email = overrides.email ?? `test-user-${userCounter}@example.com`;

  const [user] = await db<UserRow>("users")
    .insert({
      email,
      password_hash: "not-a-real-hash",
      is_admin: overrides.is_admin ?? false,
    })
    .returning("*");
  if (!user) throw new Error("failed to insert test user");

  const [wallet] = await db<WalletRow>("wallets")
    .insert({ user_id: user.id, balance: 0, currency: DEFAULT_CURRENCY })
    .returning("*");
  if (!wallet) throw new Error("failed to insert test wallet");

  return { user, wallet };
}

export async function createPendingTopup(input: {
  userId: string;
  senderPhone: string;
  requestedAmount: number;
  expiresInMinutes?: number;
}) {
  const [topup] = await db("topup_requests")
    .insert({
      user_id: input.userId,
      sender_phone: input.senderPhone,
      requested_amount: input.requestedAmount,
      status: "pending",
      expires_at: new Date(Date.now() + (input.expiresInMinutes ?? 120) * 60_000),
    })
    .returning("*");
  return topup;
}

export function libyanaSmsText(amount: number, senderPhone: string): string {
  return `تم تحويل ${amount} دينار من الرقم ${senderPhone} إلى رصيدك بنجاح`;
}
