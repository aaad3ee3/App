import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { db } from "../../src/db/knex";
import { createOrder } from "../../src/modules/orders/orders.service";
import * as referralService from "../../src/modules/referral/referral.service";
import * as walletRepo from "../../src/modules/wallet/wallet.repository";
import type { GiftCardRedemption, GiftCardSupplierAdapter } from "../../src/adapters/giftcards/giftcard-supplier.interface";
import type { SmmSupplierAdapter } from "../../src/adapters/smm/smm-supplier.interface";
import { createTestCategory, createTestProduct, createTestUser, creditTestWallet, resetDb } from "../helpers";

const UNUSED_SMM_ADAPTER: SmmSupplierAdapter = {
  listServices: () => Promise.reject(new Error("not used")),
  addOrder: () => Promise.reject(new Error("not used")),
  getOrderStatus: () => Promise.reject(new Error("not used")),
};
const GIFTCARD_ADAPTER: GiftCardSupplierAdapter = {
  listCategories: () => Promise.reject(new Error("not used")),
  listSubCategories: () => Promise.reject(new Error("not used")),
  listProducts: () => Promise.reject(new Error("not used")),
  purchase: async (): Promise<GiftCardRedemption> => ({ cardCode: "CODE-1", serialNumber: "SN-1", expiresAt: null }),
};

describe("referral program", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDb();
    if (!app) {
      app = buildApp();
      await app.ready();
    }
  });

  afterAll(async () => {
    await app?.close();
    await db.destroy();
  });

  it("resolveReferralCode returns null for an unknown code and doesn't throw", async () => {
    expect(await referralService.resolveReferralCode("DOESNOTEXIST")).toBeNull();
  });

  it("a referral code entered at signup sets referred_by, matched case-insensitively", async () => {
    const { user: referrer } = await createTestUser();
    const code = await referralService.getMyReferralInfo(referrer.id).then((r) => r.code);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "referred@example.com",
        password: "correct-horse-battery",
        confirm_password: "correct-horse-battery",
        referral_code: code.toLowerCase(),
      },
    });
    expect(res.statusCode).toBe(201);
    const referredUserId = JSON.parse(res.body).user.id as string;

    const referredRow = await db("users").where({ id: referredUserId }).first();
    expect(referredRow.referred_by).toBe(referrer.id);
  });

  it("an unknown referral code at signup is ignored, not rejected", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "referred2@example.com",
        password: "correct-horse-battery",
        confirm_password: "correct-horse-battery",
        referral_code: "GARBAGE",
      },
    });
    expect(res.statusCode).toBe(201);
    const referredUserId = JSON.parse(res.body).user.id as string;
    const referredRow = await db("users").where({ id: referredUserId }).first();
    expect(referredRow.referred_by).toBeNull();
  });

  it("rewards both sides on the referred user's first completed order, and never again on a second", async () => {
    const { user: referrer, wallet: referrerWallet } = await createTestUser();
    const { user: referred, wallet: referredWallet } = await createTestUser();
    await db("users").where({ id: referred.id }).update({ referred_by: referrer.id });
    await creditTestWallet(referred.id, referredWallet.id, 100);

    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10 });

    const firstOrder = await createOrder(
      referred.id,
      { productId: product.id },
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );
    expect(firstOrder.status).toBe("completed");
    await referralService.maybeRewardReferral(referred.id, firstOrder.id);

    const referrerAfter = await walletRepo.getWalletByUserId(referrer.id);
    const referredAfter = await walletRepo.getWalletByUserId(referred.id);
    expect(Number(referrerAfter!.balance)).toBe(5); // REFERRAL_BONUS_LYD default
    expect(Number(referredAfter!.balance)).toBe(100 - 10 + 5);

    const referredRow = await db("users").where({ id: referred.id }).first();
    expect(referredRow.referral_bonus_credited_at).not.toBeNull();

    // A second completed order must not pay out again.
    const secondOrder = await createOrder(
      referred.id,
      { productId: product.id },
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );
    await referralService.maybeRewardReferral(referred.id, secondOrder.id);

    const referrerFinal = await walletRepo.getWalletByUserId(referrer.id);
    expect(Number(referrerFinal!.balance)).toBe(5); // unchanged
  });

  it("does nothing for a user with no referrer", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 50);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10 });

    const order = await createOrder(
      user.id,
      { productId: product.id },
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );
    await referralService.maybeRewardReferral(user.id, order.id);

    const walletAfter = await walletRepo.getWalletByUserId(user.id);
    expect(Number(walletAfter!.balance)).toBe(40); // just the purchase debit, no bonus
    const bonusRows = await db("wallet_transactions").where({ user_id: user.id, type: "referral_bonus" });
    expect(bonusRows).toHaveLength(0);
  });
});
