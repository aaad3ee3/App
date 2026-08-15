import type { SmmOrderStatusResult, SmmService, SmmSupplierAdapter } from "./smm-supplier.interface";

/**
 * FUTURE PHASE — placeholder implementation. No "Plus" panel API documentation was
 * available when this was written; every method throws until it's implemented against
 * the real API. The order/fulfillment module (future phase) will depend only on
 * `SmmSupplierAdapter`, so filling this in is a self-contained task.
 */
export class PlusAdapter implements SmmSupplierAdapter {
  // TODO: constructor(config: { apiKey: string; baseUrl: string })

  async listServices(): Promise<SmmService[]> {
    throw new Error("PlusAdapter.listServices: not implemented — pending Plus panel API docs");
  }

  async addOrder(_input: { supplierServiceId: string; link: string; quantity: number; idempotencyKey: string }): Promise<{ supplierOrderId: string }> {
    throw new Error("PlusAdapter.addOrder: not implemented — pending Plus panel API docs");
  }

  async getOrderStatus(_supplierOrderId: string): Promise<SmmOrderStatusResult> {
    throw new Error("PlusAdapter.getOrderStatus: not implemented — pending Plus panel API docs");
  }
}
