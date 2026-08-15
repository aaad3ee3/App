/**
 * FUTURE PHASE — not wired into any route yet. Modeled on the de-facto standard SMM
 * panel API convention most panels (JAP-compatible) implement: `add` order and `status`
 * lookup. TODO: confirm the "Plus" panel actually follows this convention once real docs
 * are available — adjust plus.adapter.ts accordingly, the interface below should still hold.
 */
export interface SmmService {
  supplierServiceId: string;
  name: string;
  category: string;
  costPer1000: number;
  currency: string;
  minQuantity: number;
  maxQuantity: number;
}

export type SmmOrderStatus = "pending" | "in_progress" | "completed" | "partial" | "canceled" | "failed";

export interface SmmOrderStatusResult {
  status: SmmOrderStatus;
  startCount: number | null;
  remains: number | null;
}

export interface SmmSupplierAdapter {
  listServices(): Promise<SmmService[]>;
  addOrder(input: { supplierServiceId: string; link: string; quantity: number; idempotencyKey: string }): Promise<{ supplierOrderId: string }>;
  getOrderStatus(supplierOrderId: string): Promise<SmmOrderStatusResult>;
}
