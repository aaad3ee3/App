import { db } from "../../db/knex";
import { env } from "../../config/env";
import { WALLET_TX_REFERENCE_TYPES, WALLET_TX_TYPES } from "../../config/constants";
import { HttpError } from "../../plugins/error-handler.plugin";
import { BinanceApiError, BinanceClient } from "../../adapters/binance/binance.client";
import * as walletRepo from "../wallet/wallet.repository";
import * as notifications from "../notifications/notifications.service";
import * as repo from "./binance-topup.repository";

// Stablecoins only, all ~1:1 with USD — never a volatile coin (BTC/ETH/...) here without
// converting its price ourselves first, or a customer sending a handful of a cheap coin
// would get credited as if it were dollars.
const ACCEPTED_CURRENCIES = new Set(["USDT", "USDC", "BUSD", "FDUSD"]);

export function isEnabled(): boolean {
  return Boolean(env.BINANCE_API_KEY && env.BINANCE_API_SECRET);
}

function defaultClient(): BinanceClient {
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    throw new HttpError(503, "binance_not_configured", "شحن Binance Pay غير مفعّل حالياً");
  }
  return new BinanceClient({ apiKey: env.BINANCE_API_KEY, apiSecret: env.BINANCE_API_SECRET });
}

/**
 * Verifies a customer-supplied Binance Pay order id against Binance's own transaction
 * history and credits the wallet if it's a genuine, previously-unused, inbound stablecoin
 * transfer. Two-phase to close the replay hole a naive "check then credit" has: the order
 * id is reserved (an atomic, unique DB insert) BEFORE calling Binance at all, so two
 * concurrent submissions of the same id can never both pass verification — the loser
 * fails at the reservation step, not after already having "verified" it.
 */
export async function verifyAndCredit(
  userId: string,
  rawOrderId: string,
  client: BinanceClient = defaultClient()
) {
  const orderId = rawOrderId.trim();
  if (!orderId) {
    throw new HttpError(400, "order_id_required", "أدخل Order ID صحيح");
  }

  const reservation = await repo.reserve(userId, orderId);
  if (!reservation) {
    throw new HttpError(409, "order_already_used", "هذا الـ Order ID مستخدم من قبل");
  }

  let transactions;
  try {
    transactions = await client.getPayTransactions();
  } catch (err) {
    await repo.release(reservation.id);
    if (err instanceof BinanceApiError) {
      throw new HttpError(502, "binance_unreachable", "تعذر التحقق من العملية حالياً، حاول بعد قليل");
    }
    throw err;
  }

  const match = transactions.find((t) => t.orderId === orderId || t.transactionId === orderId);
  if (!match) {
    await repo.release(reservation.id);
    throw new HttpError(
      404,
      "transaction_not_found",
      "ما لقينا هذا الـ Order ID. تأكد إنك نسخته صح، أو انتظر شوي وجرب مرة ثانية."
    );
  }

  if (!ACCEPTED_CURRENCIES.has(match.currency)) {
    await repo.release(reservation.id);
    throw new HttpError(
      400,
      "unsupported_currency",
      `هذا التحويل بعملة ${match.currency}، وإحنا نقبل بس: ${[...ACCEPTED_CURRENCIES].join("، ")}`
    );
  }

  const amountLyd = Math.round(match.amount * env.BINANCE_TOPUP_USD_TO_LYD_RATE * 1000) / 1000;

  const result = await db.transaction(async (trx) => {
    const wallet = await walletRepo.getWalletByUserId(userId, trx);
    if (!wallet) throw new HttpError(404, "not_found", "Wallet not found");

    const walletTx = await walletRepo.creditWallet(trx, {
      userId,
      walletId: wallet.id,
      amount: amountLyd,
      type: WALLET_TX_TYPES.TOPUP_CREDIT,
      referenceType: WALLET_TX_REFERENCE_TYPES.BINANCE_TOPUP,
      referenceId: reservation.id,
      idempotencyKey: `binance_topup:${reservation.id}`,
      createdBy: null,
      note: `Binance Pay — Order ${orderId}`,
    });
    if (!walletTx) {
      // Fresh reservation => fresh idempotency key, unreachable in practice — defensive only.
      throw new Error(`Unexpected: binance topup idempotency-key collision for ${reservation.id}`);
    }

    await repo.markCredited(
      reservation.id,
      {
        binanceTransactionId: match.transactionId,
        amountUsdt: match.amount,
        currency: match.currency,
        amountLyd,
        walletTransactionId: walletTx.id,
      },
      trx
    );

    return { amountLyd, newBalance: walletTx.balance_after };
  });

  void notifications.notifyWalletCredited(userId, result.amountLyd.toFixed(3), Number(result.newBalance).toFixed(3));

  return {
    ok: true,
    amount_usdt: match.amount,
    currency: match.currency,
    amount_lyd: result.amountLyd,
  };
}

export async function listMyTopups(userId: string) {
  return { items: await repo.listByUser(userId, 20) };
}
