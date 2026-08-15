import type { GiftCardProduct, GiftCardRedemption, GiftCardSupplierAdapter } from "./giftcard-supplier.interface";

/**
 * FUTURE PHASE — placeholder implementation. No Libya Play API documentation was
 * available when this was written; every method throws until it's implemented against
 * the real API (auth scheme, endpoint paths, and request/response shapes are all TODOs).
 * The order/fulfillment module (future phase) will depend only on
 * `GiftCardSupplierAdapter`, so filling this in is a self-contained task.
 */
export class LibyaPlayAdapter implements GiftCardSupplierAdapter {
  // TODO: constructor(config: { apiKey: string; baseUrl: string })

  async listProducts(): Promise<GiftCardProduct[]> {
    throw new Error("LibyaPlayAdapter.listProducts: not implemented — pending Libya Play API docs");
  }

  async purchase(_input: { supplierProductId: string; quantity: number; idempotencyKey: string }): Promise<GiftCardRedemption> {
    throw new Error("LibyaPlayAdapter.purchase: not implemented — pending Libya Play API docs");
  }

  async getOrderStatus(
    _supplierOrderId: string
  ): Promise<{ status: "pending" | "fulfilled" | "failed"; redemption: GiftCardRedemption | null }> {
    throw new Error("LibyaPlayAdapter.getOrderStatus: not implemented — pending Libya Play API docs");
  }
}
