import type { Knex } from "knex";
import { db } from "../../db/knex";
import { fromMillieme, toMillieme } from "../../lib/money";
import { HttpError } from "../../plugins/error-handler.plugin";
import type { WalletRow, WalletTransactionRow, WalletTxReferenceType, WalletTxType } from "../../db/types";

export const UNIQUE_VIOLATION = "23505";

export function getWalletByUserId(userId: string, trx: Knex | Knex.Transaction = db): Promise<WalletRow | undefined> {
  return trx<WalletRow>("wallets").where({ user_id: userId }).first();
}

export interface CreditWalletInput {
  userId: string;
  walletId: string;
  /** Signed LYD amount — positive credits, negative debits (debits unused until the order module ships). */
  amount: number;
  type: WalletTxType;
  referenceType: WalletTxReferenceType;
  referenceId: string | null;
  /** Unique per logical operation — the hard backstop against double-crediting the same event twice. */
  idempotencyKey: string;
  createdBy: string | null;
  note: string | null;
}

/**
 * Applies a signed ledger entry to a wallet inside the caller's transaction. Locks the
 * wallet row (`FOR UPDATE`) so concurrent credits/debits serialize correctly. Returns
 * `null` (no-op, not an error) if `idempotencyKey` was already used — callers that get
 * `null` back should treat the operation as "already applied", not as a failure.
 *
 * Callers MUST run this inside a transaction that already holds any other locks needed
 * for the operation to stay atomic (e.g. the sms.matcher.ts flow locks the topup_requests
 * row first).
 */
export async function creditWallet(
  trx: Knex.Transaction,
  input: CreditWalletInput
): Promise<WalletTransactionRow | null> {
  const wallet = await trx<WalletRow>("wallets").where({ id: input.walletId }).forUpdate().first();
  if (!wallet) {
    throw new HttpError(404, "not_found", "Wallet not found");
  }

  const newBalanceMillieme = toMillieme(wallet.balance) + toMillieme(input.amount);
  if (newBalanceMillieme < 0) {
    throw new HttpError(409, "insufficient_balance", "Resulting wallet balance would be negative");
  }
  const balanceAfter = fromMillieme(newBalanceMillieme);

  let inserted: WalletTransactionRow[];
  try {
    inserted = await trx<WalletTransactionRow>("wallet_transactions")
      .insert({
        wallet_id: input.walletId,
        user_id: input.userId,
        type: input.type,
        amount: fromMillieme(toMillieme(input.amount)),
        balance_after: balanceAfter,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        idempotency_key: input.idempotencyKey,
        created_by: input.createdBy,
        note: input.note,
      })
      .returning("*");
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === UNIQUE_VIOLATION && pgErr.constraint === "wallet_transactions_idempotency_key_key") {
      return null;
    }
    throw err;
  }

  await trx("wallets").where({ id: input.walletId }).update({ balance: balanceAfter, updated_at: new Date() });

  return inserted[0] ?? null;
}

export async function listTransactions(
  userId: string,
  opts: { limit: number; offset: number }
): Promise<{ items: WalletTransactionRow[]; total: number }> {
  const [items, countRow] = await Promise.all([
    db<WalletTransactionRow>("wallet_transactions")
      .where({ user_id: userId })
      .orderBy("created_at", "desc")
      .limit(opts.limit)
      .offset(opts.offset),
    db<WalletTransactionRow>("wallet_transactions").where({ user_id: userId }).count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}
