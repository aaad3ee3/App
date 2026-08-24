import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import { createOrder } from "../../src/modules/orders/orders.service";
import { listProducts } from "../../src/modules/catalog/catalog.service";
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

describe("catalog — most-ordered badge", () => {
  it("flags the product with completed orders as popular, and leaves an unordered one false", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const bestseller = await createTestProduct(category.id, { kind: "giftcard", name: "Bestseller", sellPrice: 10 });
    await createTestProduct(category.id, { kind: "giftcard", name: "Never ordered", sellPrice: 20 });

    await createOrder(
      user.id,
      { productId: bestseller.id },
      { giftCard: GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
    );

    const products = await listProducts(category.id);
    const bestsellerView = products.find((p) => p.id === bestseller.id)!;
    const otherView = products.find((p) => p.id !== bestseller.id)!;

    expect(bestsellerView.popular).toBe(true);
    expect(otherView.popular).toBe(false);
  });

  it("a category with no completed orders at all shows every product as not popular", async () => {
    const category = await createTestCategory({ kind: "giftcard" });
    await createTestProduct(category.id, { kind: "giftcard" });

    const products = await listProducts(category.id);
    expect(products.every((p) => p.popular === false)).toBe(true);
  });
});
