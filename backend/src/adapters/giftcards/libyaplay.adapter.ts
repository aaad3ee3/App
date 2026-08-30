import type {
  GiftCardCategory,
  GiftCardProduct,
  GiftCardRedemption,
  GiftCardSubCategory,
  GiftCardSupplierAdapter,
} from "./giftcard-supplier.interface";
import { createLibyaPlayClientFromEnv, type LibyaPlayClient } from "./libyaplay.client";

/**
 * Wired into orders.service.ts / catalog-sync.service.ts. The HTTP client and every method
 * below are real and confirmed against Libya Play's actual API docs (categories ->
 * sub-categories -> products -> synchronous pay, `pro_type=digt`). This deliberately
 * excludes `pro_type=auto` products (live-app top-ups like Azal Live/imo) — those go
 * through the separate /social/* flow, see ../social/libyaplay-social.adapter.ts. See
 * giftcard-supplier.interface.ts for the important idempotency caveat on `purchase`.
 */
export class LibyaPlayAdapter implements GiftCardSupplierAdapter {
  private _client?: LibyaPlayClient;

  constructor(client?: LibyaPlayClient) {
    if (client) this._client = client;
  }

  /** Lazy: constructing the adapter never throws for missing env vars, only actually calling it does. */
  private get client(): LibyaPlayClient {
    if (!this._client) {
      this._client = createLibyaPlayClientFromEnv();
    }
    return this._client;
  }

  async listCategories(): Promise<GiftCardCategory[]> {
    return this.client.getCategories();
  }

  async listSubCategories(categoryId: string): Promise<GiftCardSubCategory[]> {
    return this.client.getSubCategories(categoryId);
  }

  /** Filters to Libya Play's `pro_type=digt` (direct/synchronous pay) — see client.getProductsBySubCategory. */
  async listProducts(subCategoryId: string): Promise<GiftCardProduct[]> {
    const products = await this.client.getProductsBySubCategory(subCategoryId, "digt");
    return products.map((p) => ({
      id: p.id,
      subCategoryId: p.subCategoryId,
      name: p.name,
      description: p.description,
      image: p.image,
      price: p.price,
      currency: p.currencyCode,
      available: p.available,
    }));
  }

  async purchase(input: { productId: string; env?: "sandbox" | "production" }): Promise<GiftCardRedemption> {
    const result = await this.client.pay({ productId: input.productId, env: input.env });
    return {
      cardCode: result.secretNumber,
      serialNumber: result.serialNumber || null,
      expiresAt: result.expDate || null,
    };
  }
}
