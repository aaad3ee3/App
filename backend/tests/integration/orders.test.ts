import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import { createOrder, adminMarkAmbiguousAsCompleted, adminRefundOrder } from "../../src/modules/orders/orders.service";
import * as walletRepo from "../../src/modules/wallet/wallet.repository";
import { LibyaPlayApiError } from "../../src/adapters/giftcards/libyaplay.client";
import { PlusApiError } from "../../src/adapters/smm/plus.client";
import type { GiftCardRedemption, GiftCardSupplierAdapter } from "../../src/adapters/giftcards/giftcard-supplier.interface";
import type { SmmOrderResult, SmmOrderStatusResult, SmmSupplierAdapter } from "../../src/adapters/smm/smm-supplier.interface";
import { createTestCategory, createTestProduct, createTestUser, creditTestWallet, resetDb } from "../helpers";

// --- Mock adapters — controllable outcomes, no real network calls ---

function mockGiftCardAdapter(behavior: "success" | "clean_error" | "network_error"): GiftCardSupplierAdapter {
  return {
    listCategories: () => Promise.reject(new Error("not used in these tests")),
    listSubCategories: () => Promise.reject(new Error("not used in these tests")),
    listProducts: () => Promise.reject(new Error("not used in these tests")),
    purchase: async (): Promise<GiftCardRedemption> => {
      if (behavior === "success") {
        return { cardCode: "TEST-CARD-CODE-123", serialNumber: "SN-1", expiresAt: "30/12/2026" };
      }
      if (behavior === "clean_error") {
        throw new LibyaPlayApiError(400, { status: false, data: "رصيد المحفظة غير كافٍ!" }, "insufficient balance");
      }
      throw new TypeError("fetch failed"); // simulates a genuine network failure, not an API response
    },
  };
}

function mockSmmAdapter(behavior: "success" | "clean_error" | "network_error"): SmmSupplierAdapter {
  return {
    listServices: () => Promise.reject(new Error("not used in these tests")),
    addOrder: async (): Promise<SmmOrderResult> => {
      if (behavior === "success") {
        return { supplierOrderId: "845921", orderNumber: "12550", priceUsd: 1.5 };
      }
      if (behavior === "clean_error") {
        throw new PlusApiError(422, { success: false, error: "invalid link" }, "validation error");
      }
      throw new TypeError("fetch failed");
    },
    getOrderStatus: async (): Promise<SmmOrderStatusResult> => {
      throw new Error("not used in these tests");
    },
  };
}

const UNUSED_SMM_ADAPTER = mockSmmAdapter("success");
const UNUSED_GIFTCARD_ADAPTER = mockGiftCardAdapter("success");

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe("orders engine — purchase flow", () => {
  it("giftcard: debits the wallet and completes the order on a successful purchase", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });

    const order = await createOrder(
      user.id,
      { productId: product.id },
      { giftCard: mockGiftCardAdapter("success"), smm: UNUSED_SMM_ADAPTER }
    );

    expect(order.status).toBe("completed");
    expect(order.total_price).toBe("25.0000");
    expect((order.supplier_response as { cardCode: string }).cardCode).toBe("TEST-CARD-CODE-123");

    const updatedWallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(updatedWallet!.balance)).toBe(75);

    const ledger = await db("wallet_transactions").where({ user_id: user.id, type: "order_debit" });
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].amount)).toBe(-25);
  });

  it("smm: debits per-1000 rate * quantity and leaves the order 'processing' with the supplier order ref attached", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "smm", supplier: "plus" });
    // sellPrice is a rate PER 1000 units — 10 LYD/1000, ordering 500 units => 5 LYD
    const product = await createTestProduct(category.id, {
      kind: "smm",
      supplier: "plus",
      sellPrice: 10,
      pricePer1000: true,
      minQuantity: 100,
      maxQuantity: 10000,
    });

    const order = await createOrder(
      user.id,
      { productId: product.id, quantity: 500, targetLink: "https://instagram.com/example" },
      { giftCard: UNUSED_GIFTCARD_ADAPTER, smm: mockSmmAdapter("success") }
    );

    expect(order.status).toBe("processing");
    expect(order.total_price).toBe("5.0000");
    expect(order.supplier_order_ref).toBe("12550");

    const updatedWallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(updatedWallet!.balance)).toBe(95);
  });

  it("rejects an order when the wallet balance is insufficient, and leaves no order row or debit behind", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 5);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });

    await expect(
      createOrder(user.id, { productId: product.id }, { giftCard: UNUSED_GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER })
    ).rejects.toMatchObject({ statusCode: 409, code: "insufficient_balance" });

    const updatedWallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(updatedWallet!.balance)).toBe(5);

    const orders = await db("orders").where({ user_id: user.id });
    expect(orders).toHaveLength(0);
  });

  it("rejects an order for a product whose category has been disabled, even with a known product id", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });
    await db("categories").where({ id: category.id }).update({ enabled: false });

    await expect(
      createOrder(user.id, { productId: product.id }, { giftCard: UNUSED_GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER })
    ).rejects.toMatchObject({ statusCode: 404, code: "not_found" });

    const updatedWallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(updatedWallet!.balance)).toBe(100);

    const orders = await db("orders").where({ user_id: user.id });
    expect(orders).toHaveLength(0);
  });

  it("clean supplier error (a real API response): refunds the wallet and marks the order 'failed'", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });

    const order = await createOrder(
      user.id,
      { productId: product.id },
      { giftCard: mockGiftCardAdapter("clean_error"), smm: UNUSED_SMM_ADAPTER }
    );

    expect(order.status).toBe("failed");
    expect(order.wallet_refund_transaction_id).not.toBeNull();

    const updatedWallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(updatedWallet!.balance)).toBe(100); // fully refunded

    const refundRows = await db("wallet_transactions").where({ user_id: user.id, type: "refund" });
    expect(refundRows).toHaveLength(1);
  });

  it("ambiguous network failure: does NOT refund and marks the order 'ambiguous_error' for manual review", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });

    const order = await createOrder(
      user.id,
      { productId: product.id },
      { giftCard: mockGiftCardAdapter("network_error"), smm: UNUSED_SMM_ADAPTER }
    );

    expect(order.status).toBe("ambiguous_error");
    expect(order.wallet_refund_transaction_id).toBeNull();

    // The debit stands — we don't know if Libya Play actually charged us, so we can't
    // safely give the money back yet.
    const updatedWallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(updatedWallet!.balance)).toBe(75);

    const refundRows = await db("wallet_transactions").where({ user_id: user.id, type: "refund" });
    expect(refundRows).toHaveLength(0);
  });

  it("smm: rejects a quantity below the product minimum", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "smm", supplier: "plus" });
    const product = await createTestProduct(category.id, {
      kind: "smm",
      supplier: "plus",
      sellPrice: 10,
      pricePer1000: true,
      minQuantity: 100,
      maxQuantity: 10000,
    });

    await expect(
      createOrder(
        user.id,
        { productId: product.id, quantity: 10, targetLink: "https://instagram.com/example" },
        { giftCard: UNUSED_GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
      )
    ).rejects.toMatchObject({ statusCode: 400, code: "invalid_quantity" });

    const orders = await db("orders").where({ user_id: user.id });
    expect(orders).toHaveLength(0);
  });

  it("smm: rejects an order with no target_link", async () => {
    const { user, wallet } = await createTestUser();
    await creditTestWallet(user.id, wallet.id, 100);
    const category = await createTestCategory({ kind: "smm", supplier: "plus" });
    const product = await createTestProduct(category.id, {
      kind: "smm",
      supplier: "plus",
      sellPrice: 10,
      pricePer1000: true,
      minQuantity: 100,
      maxQuantity: 10000,
    });

    await expect(
      createOrder(
        user.id,
        { productId: product.id, quantity: 500 },
        { giftCard: UNUSED_GIFTCARD_ADAPTER, smm: UNUSED_SMM_ADAPTER }
      )
    ).rejects.toMatchObject({ statusCode: 400, code: "target_link_required" });
  });

  describe("admin resolution of ambiguous orders", () => {
    async function createAmbiguousOrder() {
      const { user, wallet } = await createTestUser();
      await creditTestWallet(user.id, wallet.id, 100);
      const category = await createTestCategory({ kind: "giftcard" });
      const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 25 });
      const order = await createOrder(
        user.id,
        { productId: product.id },
        { giftCard: mockGiftCardAdapter("network_error"), smm: UNUSED_SMM_ADAPTER }
      );
      return { user, order };
    }

    it("adminMarkAmbiguousAsCompleted: marks completed without touching the wallet", async () => {
      const { user, order } = await createAmbiguousOrder();

      const resolved = await adminMarkAmbiguousAsCompleted(order.id, "confirmed on Libya Play dashboard");
      expect(resolved.status).toBe("completed");

      const wallet = await walletRepo.getWalletByUserId(user.id);
      expect(Number(wallet!.balance)).toBe(75); // unchanged — no refund on this path
    });

    it("adminRefundOrder: credits the wallet back exactly once, even if called twice", async () => {
      const { user, order } = await createAmbiguousOrder();

      const first = await adminRefundOrder(order.id, "confirmed not charged");
      expect(first.status).toBe("refunded");

      const walletAfterFirst = await walletRepo.getWalletByUserId(user.id);
      expect(Number(walletAfterFirst!.balance)).toBe(100);

      // Second call should be a no-op on the wallet thanks to the idempotency key, even
      // though the order is already 'refunded' (not ambiguous/failed) — exercised here at
      // the repository level via a direct second call to prove the ledger can't double-credit.
      await expect(adminRefundOrder(order.id, "duplicate click")).rejects.toMatchObject({ statusCode: 409 });

      const walletAfterSecond = await walletRepo.getWalletByUserId(user.id);
      expect(Number(walletAfterSecond!.balance)).toBe(100);

      const refundRows = await db("wallet_transactions").where({ user_id: user.id, type: "refund" });
      expect(refundRows).toHaveLength(1);
    });
  });
});
