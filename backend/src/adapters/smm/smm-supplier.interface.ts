/**
 * FUTURE PHASE — not wired into any route yet. Matches the real "Plus" panel API
 * (https://hamadh.net/api/v2), confirmed against their docs — a single base URL with an
 * `action` dispatcher, not the classic multi-endpoint JAP layout.
 *
 * NOTE: like Libya Play's digital-products payment endpoint, Plus's `order` action has no
 * idempotency-key / client-supplied reference parameter. A retried `addOrder` call after
 * a network failure isn't safely distinguishable from a genuine double-order on their
 * side. The future order/fulfillment module needs to account for this explicitly.
 */
export interface SmmService {
  supplierServiceId: string;
  name: string;
  costPer1000: number;
  currency: string;
  minQuantity: number;
  maxQuantity: number;
}

export interface SmmOrderResult {
  supplierOrderId: string;
  /** Plus's own internal order number — what `getOrderStatus` is keyed on. */
  orderNumber: string;
  priceUsd: number;
}

export interface SmmOrderStatusResult {
  orderNumber: string;
  serviceName: string;
  quantity: number;
  remains: number | null;
  /** Raw string as Plus returns it (e.g. "In progress") — no confirmed closed enum yet, only one example value seen. */
  status: string;
  priceUsd: number;
}

export interface SmmSupplierAdapter {
  listServices(): Promise<SmmService[]>;
  /** See the idempotency note above — this is a one-shot call, not safely retryable as-is. */
  addOrder(input: { supplierServiceId: string; link: string; quantity: number }): Promise<SmmOrderResult>;
  getOrderStatus(orderNumber: string): Promise<SmmOrderStatusResult>;
}
