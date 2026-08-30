import { createLibyaPlayClientFromEnv, type LibyaPlayClient } from "../giftcards/libyaplay.client";
import type { SocialCategory, SocialOrderResult, SocialProduct, SocialSupplierAdapter } from "./social-supplier.interface";

/** Adapts Libya Play's /social/* endpoints — same account/credentials as the digt gift-card
 *  flow (LibyaPlayClient), a completely different purchase lifecycle. See the interface file. */
export class LibyaPlaySocialAdapter implements SocialSupplierAdapter {
  private _client?: LibyaPlayClient;

  constructor(client?: LibyaPlayClient) {
    if (client) this._client = client;
  }

  private get client(): LibyaPlayClient {
    if (!this._client) {
      this._client = createLibyaPlayClientFromEnv();
    }
    return this._client;
  }

  async listCategories(): Promise<SocialCategory[]> {
    const categories = await this.client.getSocialCategories();
    return categories.map((c) => ({ id: String(c.id), name: c.name, image: c.image || null }));
  }

  async listProducts(categoryId: string): Promise<SocialProduct[]> {
    const products = await this.client.getSocialProductsByCategory(Number(categoryId));
    return products.map((p) => ({
      id: String(p.id),
      categoryId: String(p.categoryId),
      name: p.name,
      image: p.image || null,
      price: p.sellingPrice,
      currency: p.currencyCode,
      params: p.params,
      minQuantity: p.qtyMin,
      maxQuantity: p.qtyMax,
      available: p.available,
    }));
  }

  async purchase(input: {
    productId: string;
    quantity: number;
    params: Record<string, string>;
    orderUuid: string;
    env?: "sandbox" | "production";
  }): Promise<SocialOrderResult> {
    const result = await this.client.paySocial({
      productId: Number(input.productId),
      qty: input.quantity,
      params: input.params,
      orderUuid: input.orderUuid,
      env: input.env,
    });
    return { supplierOrderId: String(result.orderId), status: result.status };
  }

  async pollStatuses(): Promise<Record<string, string>> {
    const rows = await this.client.getSocialOrderAndStatus();
    const map: Record<string, string> = {};
    for (const r of rows) map[String(r.id)] = r.status;
    return map;
  }
}
