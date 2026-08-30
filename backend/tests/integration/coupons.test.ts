import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import { createOrder } from "../../src/modules/orders/orders.service";
import * as couponsRepo from "../../src/modules/coupons/coupons.repository";
import * as couponsService from "../../src/modules/coupons/coupons.service";
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

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe("coupons — applied inside the purchase transaction", () => {
  it("fixed discount reduces the charged amount and records a redemption", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });
    await couponsRepo.create({
      code: "SAVE5",
      discountType: "fixed",
      discountValue: 5,
      minOrderAmount: 0,
      maxUses: null,
      maxUsesPerUser: 1,
      expiresAt: null,
    });

    const order = await createOrder(
      user.id,
      { productId: product.id, couponCode: "save5" }, // lowercase — codes are case-insensitive
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );

    expect(order.total_price).toBe("20.0000");
    const wallet2 = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet2!.balance)).toBe(80);

    const redemptions = await db("coupon_redemptions").where({ order_id: order.id });
    expect(redemptions).toHaveLength(1);
    expect(Number(redemptions[0].discount_amount)).toBe(5);

    const coupon = await couponsRepo.findByCode("SAVE5");
    expect(coupon!.used_count).toBe(1);
  });

  it("percent discount is computed off the order total and capped at 100%", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 40 });
    await couponsRepo.create({
      code: "TEN",
      discountType: "percent",
      discountValue: 10,
      minOrderAmount: 0,
      maxUses: null,
      maxUsesPerUser: 1,
      expiresAt: null,
    });

    const order = await createOrder(
      user.id,
      { productId: product.id, couponCode: "TEN" },
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );

    expect(order.total_price).toBe("36.0000"); // 40 - 10%
  });

  it("rejects an unknown coupon code without touching the wallet", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });

    await expect(
      createOrder(
        user.id,
        { productId: product.id, couponCode: "NOPE" },
        { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
      )
    ).rejects.toMatchObject({ statusCode: 404, code: "coupon_not_found" });

    const wallet2 = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet2!.balance)).toBe(100);
    expect(await db("orders").where({ user_id: user.id })).toHaveLength(0);
  });

  it("refuses a coupon below its minimum order amount", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10 });
    await couponsRepo.create({
      code: "BIGORDER",
      discountType: "fixed",
      discountValue: 5,
      minOrderAmount: 50,
      maxUses: null,
      maxUsesPerUser: 1,
      expiresAt: null,
    });

    await expect(
      createOrder(
        user.id,
        { productId: product.id, couponCode: "BIGORDER" },
        { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "coupon_min_order_not_met" });
  });

  it("refuses a second redemption by the same user past max_uses_per_user", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10 });
    await couponsRepo.create({
      code: "ONCE",
      discountType: "fixed",
      discountValue: 2,
      minOrderAmount: 0,
      maxUses: null,
      maxUsesPerUser: 1,
      expiresAt: null,
    });

    await createOrder(
      user.id,
      { productId: product.id, couponCode: "ONCE" },
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );

    await expect(
      createOrder(
        user.id,
        { productId: product.id, couponCode: "ONCE" },
        { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "coupon_already_used" });
  });

  it("refuses once max_uses total is reached, even for a different user", async () => {
    const { user: user1, wallet: wallet1 } = await createTestUser();
    const { user: user2, wallet: wallet2 } = await createTestUser();
    await creditTestWallet(user1.id, wallet1.id, 100);
    await creditTestWallet(user2.id, wallet2.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10 });
    await couponsRepo.create({
      code: "LIMITED",
      discountType: "fixed",
      discountValue: 2,
      minOrderAmount: 0,
      maxUses: 1,
      maxUsesPerUser: 5,
      expiresAt: null,
    });

    await createOrder(
      user1.id,
      { productId: product.id, couponCode: "LIMITED" },
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );

    await expect(
      createOrder(
        user2.id,
        { productId: product.id, couponCode: "LIMITED" },
        { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
      )
    ).rejects.toMatchObject({ statusCode: 409, code: "coupon_exhausted" });
  });

  it("admin service rejects an out-of-range percent value", async () => {
    await expect(
      couponsService.createCoupon({
        code: "BAD",
        discountType: "percent",
        discountValue: 150,
        minOrderAmount: 0,
        maxUses: null,
        maxUsesPerUser: 1,
        expiresAt: null,
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "invalid_discount_value" });
  });
});
