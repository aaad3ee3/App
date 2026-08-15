import type { GiftCardProduct, GiftCardRedemption, GiftCardSupplierAdapter } from "./giftcard-supplier.interface";
import { createLibyaPlayClientFromEnv, type LibyaPlayAppInfo, type LibyaPlayClient } from "./libyaplay.client";

/**
 * FUTURE PHASE — not wired into any route yet. The HTTP client (base URL + `x-api-key` /
 * `x-email` auth) is real and confirmed working against `/general/app-info`. The three
 * interface methods below still throw: Libya Play's docs for the catalog, purchase, and
 * order-status endpoints haven't been provided yet. Once they are, each method is a
 * self-contained fill-in — call `this.client.request(path, init)` and map the response
 * into the shapes `GiftCardSupplierAdapter` expects.
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

  /** Not part of GiftCardSupplierAdapter — a connectivity/credentials smoke check (see src/scripts/check-libyaplay.ts). */
  async getAppInfo(): Promise<LibyaPlayAppInfo> {
    return this.client.getAppInfo();
  }

  async listProducts(): Promise<GiftCardProduct[]> {
    throw new Error(
      "LibyaPlayAdapter.listProducts: not implemented — need the catalog/products endpoint spec from Libya Play docs"
    );
  }

  async purchase(_input: {
    supplierProductId: string;
    quantity: number;
    idempotencyKey: string;
  }): Promise<GiftCardRedemption> {
    throw new Error(
      "LibyaPlayAdapter.purchase: not implemented — need the purchase/redeem endpoint spec from Libya Play docs"
    );
  }

  async getOrderStatus(
    _supplierOrderId: string
  ): Promise<{ status: "pending" | "fulfilled" | "failed"; redemption: GiftCardRedemption | null }> {
    throw new Error(
      "LibyaPlayAdapter.getOrderStatus: not implemented — need the order-status endpoint spec from Libya Play docs"
    );
  }
}
