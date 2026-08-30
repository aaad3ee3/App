import type { Knex } from "knex";
import { db } from "../../db/knex";
import { fromMillieme, toMillieme } from "../../lib/money";
import type { TopupRequestRow, TopupStatus } from "../../db/types";

export const UNIQUE_VIOLATION = "23505";

export function insertPending(
  input: { userId: string; senderPhone: string; requestedAmount: number | null; expiresAt: Date },
  trx: Knex | Knex.Transaction = db
): Promise<TopupRequestRow[]> {
  return trx<TopupRequestRow>("topup_requests")
    .insert({
      user_id: input.userId,
      sender_phone: input.senderPhone,
      requested_amount: input.requestedAmount === null ? null : fromMillieme(toMillieme(input.requestedAmount)),
      status: "pending",
      expires_at: input.expiresAt,
    })
    .returning("*");
}

export function findById(id: string, trx: Knex | Knex.Transaction = db): Promise<TopupRequestRow | undefined> {
  return trx<TopupRequestRow>("topup_requests").where({ id }).first();
}

export async function listByUser(
  userId: string,
  opts: { limit: number; offset: number; status?: TopupStatus }
): Promise<{ items: TopupRequestRow[]; total: number }> {
  const base = db<TopupRequestRow>("topup_requests").where({ user_id: userId });
  if (opts.status) base.andWhere({ status: opts.status });

  const [items, countRow] = await Promise.all([
    base.clone().orderBy("created_at", "desc").limit(opts.limit).offset(opts.offset),
    base.clone().count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}

export function cancelPending(id: string, userId: string): Promise<number> {
  return db("topup_requests")
    .where({ id, user_id: userId, status: "pending" })
    .update({ status: "cancelled", updated_at: new Date() });
}

/** Admin-facing: lists top-up requests across all users, optionally filtered by status. */
export async function listAll(opts: {
  limit: number;
  offset: number;
  status?: TopupStatus;
}): Promise<{ items: TopupRequestRow[]; total: number }> {
  const base = db<TopupRequestRow>("topup_requests");
  if (opts.status) base.andWhere({ status: opts.status });

  const [items, countRow] = await Promise.all([
    base.clone().orderBy("created_at", "desc").limit(opts.limit).offset(opts.offset),
    base.clone().count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}
