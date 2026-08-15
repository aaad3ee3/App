/**
 * FUTURE PHASE — not wired into any route yet. Defined now so the future order/fulfillment
 * module can depend on this interface instead of a concrete supplier, keeping the swap to
 * real Libya Play API shapes a one-file change (see libyaplay.adapter.ts).
 */
export interface GiftCardProduct {
  supplierProductId: string;
  name: string;
  /** Supplier's cost price — the store's sell price/markup is a catalog-module concern, not this adapter's. */
  costPrice: number;
  currency: string;
  inStock: boolean;
}

export interface GiftCardRedemption {
  supplierOrderId: string;
  cardCode: string;
  cardPin: string | null;
}

export interface GiftCardSupplierAdapter {
  listProducts(): Promise<GiftCardProduct[]>;
  purchase(input: { supplierProductId: string; quantity: number; idempotencyKey: string }): Promise<GiftCardRedemption>;
  getOrderStatus(supplierOrderId: string): Promise<{ status: "pending" | "fulfilled" | "failed"; redemption: GiftCardRedemption | null }>;
}
