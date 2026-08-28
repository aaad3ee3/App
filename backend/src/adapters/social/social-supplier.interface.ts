/**
 * Libya Play's "social" flow — live-app top-ups (Azal Live, Party Star, imo, ...): a
 * customer supplies a platform user id rather than receiving a redeemable code, and the
 * credit happens asynchronously on Libya Play's side. Confirmed against Libya Play's own
 * /social/* API docs (categories / products-by-category / pay / order-and-status) — a
 * materially different lifecycle from the digt gift-card flow (giftcard-supplier.interface.ts),
 * and requires polling, see poll-social-orders.job.ts.
 */
export interface SocialCategory {
  id: string;
  name: string;
  image: string | null;
}

export interface SocialProduct {
  id: string;
  categoryId: string;
  name: string;
  image: string | null;
  /** Already a per-unit price, unlike SMM's per-1000 rate. */
  price: number;
  currency: string;
  /** Field labels (Arabic, as Libya Play names them) the customer must fill in — e.g.
   *  "معرف المستخدم". Passed back verbatim as the `params` object's keys on purchase. */
  params: string[];
  minQuantity: number;
  maxQuantity: number;
  available: boolean;
}

export interface SocialOrderResult {
  supplierOrderId: string;
  /** Libya Play's own status vocabulary: 'pending' | 'accept' | 'reject' | 'wait'. Never
   *  final at purchase time — see poll-social-orders.job.ts. */
  status: string;
}

export interface SocialSupplierAdapter {
  listCategories(): Promise<SocialCategory[]>;
  listProducts(categoryId: string): Promise<SocialProduct[]>;
  purchase(input: {
    productId: string;
    quantity: number;
    params: Record<string, string>;
    /** Doubles as the supplier's own idempotency key for this call — always this order's own id. */
    orderUuid: string;
    env?: "sandbox" | "production";
  }): Promise<SocialOrderResult>;
  /** Every known order's current status, keyed by supplierOrderId — see poll-social-orders.job.ts. */
  pollStatuses(): Promise<Record<string, string>>;
}
