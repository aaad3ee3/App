/**
 * FUTURE PHASE — not wired into any route yet (no catalog/order module exists). Matches
 * Libya Play's real `/digital-products/*` catalog shape (confirmed against their docs):
 * a 3-level hierarchy — category -> sub-category -> product — not a flat product list.
 * `listProducts` intentionally takes a subCategoryId; there is no "list everything" endpoint.
 *
 * NOTE: Libya Play's digital-products purchase endpoint has no idempotency-key parameter
 * (unlike their /social/pay, which does). A retried purchase call after a network failure
 * is NOT provably safe to distinguish from a genuine double-purchase on their side. The
 * future order/fulfillment module must account for this explicitly (e.g. never
 * auto-retry `purchase`, log the attempt before calling, reconcile manually on ambiguous
 * failures) rather than assuming the usual "insert with idempotency key" pattern works here.
 */
export interface GiftCardCategory {
  id: string;
  name: string;
  image: string;
  /** e.g. "cards" | "games" as returned by Libya Play — not a closed enum on their side. */
  type: string;
}

export interface GiftCardSubCategory {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  howToUse: string;
  policy: string;
  image: string;
}

export interface GiftCardProduct {
  id: string;
  subCategoryId: string;
  name: string;
  description: string;
  image: string;
  price: number;
  currency: string;
  available: boolean;
}

export interface GiftCardRedemption {
  cardCode: string;
  serialNumber: string | null;
  expiresAt: string | null;
}

export interface GiftCardSupplierAdapter {
  listCategories(): Promise<GiftCardCategory[]>;
  listSubCategories(categoryId: string): Promise<GiftCardSubCategory[]>;
  listProducts(subCategoryId: string): Promise<GiftCardProduct[]>;
  /** See the idempotency note above — this is a one-shot call, not safely retryable as-is. */
  purchase(input: { productId: string; env?: "sandbox" | "production" }): Promise<GiftCardRedemption>;
}
