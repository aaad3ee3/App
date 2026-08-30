import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { BinanceTopupRow } from "../../db/types";

export const UNIQUE_VIOLATION = "23505";

/**
 * Reserves an order id for this user before we've even asked Binance about it. The
 * UNIQUE index on `binance_order_id` is what actually prevents replay — two requests
 * (same or different user) racing on the same order id can both attempt this insert, but
 * only one wins. See binance-topup.service.ts for what happens on the losing side vs.
 * what happens if verification then fails and the reservation is released.
 */
export async function reserve(userId: string, orderId: string): Promise<BinanceTopupRow | null> {
  try {
    const [row] = await db<BinanceTopupRow>("binance_topups")
      .insert({ user_id: userId, binance_order_id: orderId, status: "pending" })
      .returning("*");
    return row ?? null;
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === UNIQUE_VIOLATION) return null;
    throw err;
  }
}

/** Releases a reservation whose verification failed — e.g. the transfer hasn't landed on
 *  Binance's side yet — so the same order id can be retried once it does. */
export function release(id: string): Promise<number> {
  return db("binance_topups").where({ id, status: "pending" }).del();
}

export function markCredited(
  id: string,
  fields: {
    binanceTransactionId: string;
    amountUsdt: number;
    currency: string;
    amountLyd: number;
    walletTransactionId: string;
  },
  trx: Knex | Knex.Transaction = db
): Promise<number> {
  return trx("binance_topups")
    .where({ id })
    .update({
      status: "credited",
      binance_transaction_id: fields.binanceTransactionId,
      amount_usdt: fields.amountUsdt.toFixed(8),
      currency: fields.currency,
      amount_lyd: fields.amountLyd.toFixed(3),
      wallet_transaction_id: fields.walletTransactionId,
      updated_at: new Date(),
    });
}

export async function listByUser(userId: string, limit: number): Promise<BinanceTopupRow[]> {
  return db<BinanceTopupRow>("binance_topups").where({ user_id: userId }).orderBy("created_at", "desc").limit(limit);
}

export async function listAllAdmin(opts: { limit: number; offset: number }): Promise<{ items: BinanceTopupRow[]; total: number }> {
  const [items, countRow] = await Promise.all([
    db<BinanceTopupRow>("binance_topups").orderBy("created_at", "desc").limit(opts.limit).offset(opts.offset),
    db<BinanceTopupRow>("binance_topups").count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}
