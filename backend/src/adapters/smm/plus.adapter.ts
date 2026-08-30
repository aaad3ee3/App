import type { SmmOrderResult, SmmOrderStatusResult, SmmService, SmmSupplierAdapter } from "./smm-supplier.interface";
import { createPlusClientFromEnv, type PlusClient } from "./plus.client";

/**
 * FUTURE PHASE — not wired into any route yet (no catalog/order module exists). The HTTP
 * client and every method below are real and confirmed against Plus's actual API docs
 * and live tester. See smm-supplier.interface.ts for the idempotency caveat on `addOrder`.
 */
export class PlusAdapter implements SmmSupplierAdapter {
  private _client?: PlusClient;

  constructor(client?: PlusClient) {
    if (client) this._client = client;
  }

  /** Lazy: constructing the adapter never throws for missing env vars, only actually calling it does. */
  private get client(): PlusClient {
    if (!this._client) {
      this._client = createPlusClientFromEnv();
    }
    return this._client;
  }

  async listServices(): Promise<SmmService[]> {
    const services = await this.client.getServices();
    return services.map((s) => ({
      supplierServiceId: String(s.serviceId),
      name: s.name,
      costPer1000: s.pricePer1000Usd,
      currency: "USD",
      minQuantity: s.min,
      maxQuantity: s.max,
    }));
  }

  async addOrder(input: { supplierServiceId: string; link: string; quantity: number }): Promise<SmmOrderResult> {
    const result = await this.client.addOrder({
      serviceId: Number(input.supplierServiceId),
      quantity: input.quantity,
      link: input.link,
    });
    return {
      supplierOrderId: result.smmOrderId,
      orderNumber: String(result.orderNumber),
      priceUsd: result.priceUsd,
    };
  }

  async getOrderStatus(orderNumber: string): Promise<SmmOrderStatusResult> {
    const result = await this.client.getOrderStatus(Number(orderNumber));
    return {
      orderNumber: String(result.orderNumber),
      serviceName: result.serviceName,
      quantity: result.quantity,
      remains: result.remains,
      status: result.status,
      priceUsd: result.priceUsd,
    };
  }
}
