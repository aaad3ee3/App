import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { AdminActionRow, UserRow, WalletRow } from "../../db/types";

export function logAction(
  input: { adminUserId: string; action: string; targetType: AdminActionRow["target_type"]; targetId: string; details?: unknown },
  trx: Knex | Knex.Transaction = db
): Promise<void> {
  return trx("admin_actions").insert({
    admin_user_id: input.adminUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    details: input.details ?? null,
  });
}

export async function listUsers(opts: { limit: number; offset: number }): Promise<{
  items: (Pick<UserRow, "id" | "email" | "full_name" | "is_admin" | "status" | "created_at"> & {
    balance: string | null;
  })[];
  total: number;
}> {
  const [items, countRow] = await Promise.all([
    db<UserRow>("users")
      .leftJoin("wallets", "wallets.user_id", "users.id")
      .orderBy("users.created_at", "desc")
      .limit(opts.limit)
      .offset(opts.offset)
      .select(
        "users.id",
        "users.email",
        "users.full_name",
        "users.is_admin",
        "users.status",
        "users.created_at",
        "wallets.balance"
      ),
    db<UserRow>("users").count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}

export async function getUserDetail(userId: string) {
  const row = await db<UserRow>("users")
    .leftJoin("wallets", "wallets.user_id", "users.id")
    .where("users.id", userId)
    .select(
      "users.id",
      "users.email",
      "users.full_name",
      "users.is_admin",
      "users.status",
      "users.failed_login_attempts",
      "users.locked_until",
      "users.created_at",
      "wallets.balance",
      "wallets.currency"
    )
    .first<
      (Pick<UserRow, "id" | "email" | "full_name" | "is_admin" | "status" | "failed_login_attempts" | "locked_until" | "created_at"> &
        Pick<WalletRow, "balance" | "currency">) | undefined
    >();
  return row;
}
