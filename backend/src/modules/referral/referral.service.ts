import { db } from "../../db/knex";
import { env } from "../../config/env";
import { WALLET_TX_REFERENCE_TYPES, WALLET_TX_TYPES } from "../../config/constants";
import * as walletRepo from "../wallet/wallet.repository";
import * as notifications from "../notifications/notifications.service";
import * as repo from "./referral.repository";

export async function getMyReferralInfo(userId: string) {
  const [code, referredCount, totalEarned] = await Promise.all([
    repo.getOrCreateReferralCode(userId),
    repo.countReferrals(userId),
    repo.sumReferralBonusEarned(userId),
  ]);
  return {
    code,
    share_text: `جرّب تطبيق سايح واحصل على رصيد مجاني عند أول عملية شراء — استخدم الكود ${code} عند التسجيل`,
    referred_count: referredCount,
    total_earned: totalEarned.toFixed(3),
    bonus_amount: env.REFERRAL_BONUS_LYD.toFixed(3),
  };
}

/** Resolves a referral code typed at signup to the referring user's id. Returns null for
 *  an unknown code rather than throwing — a bad/mistyped code should never block signup. */
export async function resolveReferralCode(code: string): Promise<string | null> {
  const user = await repo.findUserByReferralCode(code);
  return user?.id ?? null;
}

/**
 * Rewards both sides of a referral the moment the referred customer's first order
 * completes — deliberately not at signup, so a code can't be farmed by creating accounts
 * that never buy anything.
 *
 * Runs its own short transaction, separate from the order's own (which has already
 * committed by the time this is called from both call sites — see orders.service.ts and
 * poll-smm-orders.job.ts). A failure here must never be able to undo a completed order,
 * so it stays fully isolated and best-effort: errors are logged, not thrown.
 */
export async function maybeRewardReferral(userId: string, orderId: string): Promise<void> {
  try {
    const result = await db.transaction(async (trx) => {
      const user = await repo.lockUserForReferralReward(userId, trx);
      if (!user || !user.referred_by || user.referral_bonus_credited_at) return null;

      const completedOrders = await repo.countCompletedOrders(userId, trx);
      if (completedOrders !== 1) return null; // only the customer's first completed order counts

      const [referredWallet, referrerWallet] = await Promise.all([
        walletRepo.getWalletByUserId(userId, trx),
        walletRepo.getWalletByUserId(user.referred_by, trx),
      ]);
      if (!referredWallet || !referrerWallet) return null;

      await walletRepo.creditWallet(trx, {
        userId,
        walletId: referredWallet.id,
        amount: env.REFERRAL_BONUS_LYD,
        type: WALLET_TX_TYPES.REFERRAL_BONUS,
        referenceType: WALLET_TX_REFERENCE_TYPES.ORDER,
        referenceId: orderId,
        idempotencyKey: `referral:${userId}:bonus`,
        createdBy: null,
        note: "مكافأة إحالة — أول عملية شراء",
      });
      await walletRepo.creditWallet(trx, {
        userId: user.referred_by,
        walletId: referrerWallet.id,
        amount: env.REFERRAL_BONUS_LYD,
        type: WALLET_TX_TYPES.REFERRAL_BONUS,
        referenceType: WALLET_TX_REFERENCE_TYPES.ORDER,
        referenceId: orderId,
        idempotencyKey: `referral:${user.referred_by}:bonus_for:${userId}`,
        createdBy: null,
        note: "مكافأة إحالة — صديق أكمل أول عملية شراء",
      });
      await repo.markReferralBonusCredited(userId, trx);

      return user.referred_by;
    });

    if (result) {
      void notifications.notifyUser(userId, {
        title: "مكافأة إحالة 🎁",
        body: `حصلت على ${env.REFERRAL_BONUS_LYD.toFixed(2)} د.ل رصيد مجاني`,
        data: { type: "referral_bonus" },
      });
      void notifications.notifyUser(result, {
        title: "مكافأة إحالة 🎁",
        body: `صديقك أكمل أول عملية شراء — حصلت على ${env.REFERRAL_BONUS_LYD.toFixed(2)} د.ل رصيد مجاني`,
        data: { type: "referral_bonus" },
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[referral.service] maybeRewardReferral failed:", err);
  }
}
