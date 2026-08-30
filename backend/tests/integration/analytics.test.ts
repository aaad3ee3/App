import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import { createOrder } from "../../src/modules/orders/orders.service";
import { getAnalyticsSummary } from "../../src/modules/admin/admin.service";
import { LibyaPlayApiError } from "../../src/adapters/giftcards/libyaplay.client";
import type { GiftCardRedemption, GiftCardSupplierAdapter } from "../../src/adapters/giftcards/giftcard-supplier.interface";
import type { SmmOrderResult, SmmOrderStatusResult, SmmSupplierAdapter } from "../../src/adapters/smm/smm-supplier.interface";
import type { SocialSupplierAdapter } from "../../src/adapters/social/social-supplier.interface";
import { createTestCategory, createTestProduct, createTestUser, creditTestWallet, resetDb } from "../helpers";

const NOT_USED = (): Promise<never> => Promise.reject(new Error("not used in this test"));

const GIFTCARD_ADAPTER: GiftCardSupplierAdapter = {
  listCategories: NOT_USED,
  listSubCategories: NOT_USED,
  listProducts: NOT_USED,
  purchase: async (): Promise<GiftCardRedemption> => ({ cardCode: "CODE-1", serialNumber: "SN-1", expiresAt: "30/12/2026" }),
};

const SMM_ADAPTER: SmmSupplierAdapter = {
  listServices: NOT_USED,
  addOrder: async (): Promise<SmmOrderResult> => ({ supplierOrderId: "1", orderNumber: "1", priceUsd: 1 }),
  getOrderStatus: (): Promise<SmmOrderStatusResult> => NOT_USED(),
};

const SOCIAL_ADAPTER: SocialSupplierAdapter = {
  listCategories: NOT_USED,
  listProducts: NOT_USED,
  purchase: NOT_USED,
};

describe("admin analytics — revenue and profit", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("splits revenue/profit into كروت (giftcard) vs الرشق (smm), and combines them for the total", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 1000);

    // giftcard: sell 100, cost = 100*0.8 = 80 (see createTestProduct's default) => profit 20
    const giftcardCategory = await createTestCategory({ kind: "giftcard" });
    const giftcardProduct = await createTestProduct(giftcardCategory.id, { kind: "giftcard", sellPrice: 100 });
    await createOrder(
      user.id,
      { productId: giftcardProduct.id },
      { giftCard: GIFTCARD_ADAPTER, smm: SMM_ADAPTER, social: SOCIAL_ADAPTER }
    );

    // smm: sell 10/1000, cost 8/1000, quantity 500 => total_price 5, total_cost 4, profit 1
    const smmCategory = await createTestCategory({ kind: "smm", supplier: "plus" });
    const smmProduct = await createTestProduct(smmCategory.id, {
      kind: "smm",
      supplier: "plus",
      sellPrice: 10,
      pricePer1000: true,
      minQuantity: 100,
      maxQuantity: 10000,
    });
    await createOrder(
      user.id,
      { productId: smmProduct.id, quantity: 500, targetLink: "https://instagram.com/example" },
      { giftCard: GIFTCARD_ADAPTER, smm: SMM_ADAPTER, social: SOCIAL_ADAPTER }
    );

    const summary = await getAnalyticsSummary();

    expect(summary.stores.cards.revenue.today).toBeCloseTo(100, 4);
    expect(summary.stores.cards.profit.today).toBeCloseTo(20, 4);
    expect(summary.stores.cards.orders.today).toBe(1);

    expect(summary.stores.rasheq.revenue.today).toBeCloseTo(5, 4);
    expect(summary.stores.rasheq.profit.today).toBeCloseTo(1, 4);
    expect(summary.stores.rasheq.orders.today).toBe(1);

    expect(summary.stores.combined.revenue.today).toBeCloseTo(105, 4);
    expect(summary.stores.combined.profit.today).toBeCloseTo(21, 4);
    expect(summary.stores.combined.orders.today).toBe(2);

    // Same-day totals roll up into the month/year buckets too.
    expect(summary.stores.combined.revenue.month).toBeCloseTo(105, 4);
    expect(summary.stores.combined.revenue.year).toBeCloseTo(105, 4);

    const topNames = summary.top_products.map((p) => p.id);
    expect(topNames).toContain(giftcardProduct.id);
    expect(topNames).toContain(smmProduct.id);
  });

  it("excludes refunded orders from revenue and profit", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 1000);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 50 });

    const failingAdapter: GiftCardSupplierAdapter = {
      ...GIFTCARD_ADAPTER,
      purchase: () => {
        throw new LibyaPlayApiError(400, { status: false, data: "رصيد المحفظة غير كافٍ!" }, "insufficient balance");
      },
    };

    await createOrder(user.id, { productId: product.id }, { giftCard: failingAdapter, smm: SMM_ADAPTER, social: SOCIAL_ADAPTER });

    const summary = await getAnalyticsSummary();
    expect(summary.stores.cards.revenue.today).toBe(0);
    expect(summary.stores.cards.profit.today).toBe(0);
    expect(summary.stores.cards.orders.today).toBe(0);
  });
});
