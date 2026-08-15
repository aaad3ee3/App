import { env } from "../../config/env";

/**
 * Thin HTTP client for the "Plus" SMM panel API (https://hamadh.net/api/v2). Single base
 * URL, an `action` param dispatches the operation. Auth via `Authorization: Bearer
 * <api_key>` header (confirmed working against their live tester) — GET actions also
 * accept `api_key` as a query param per their docs, so we send both defensively.
 */
export class PlusApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
  }
}

export interface PlusClientConfig {
  baseUrl: string;
  apiKey: string;
}

export interface PlusBalance {
  balanceUsd: number;
  balanceFormatted: string;
  userId: number;
}

interface RawPlusService {
  service_id: number;
  name: string;
  min: number;
  max: number;
  price_per_1000_usd: number;
}

export interface PlusService {
  serviceId: number;
  name: string;
  min: number;
  max: number;
  pricePer1000Usd: number;
}

export interface PlusOrderResult {
  orderNumber: number;
  smmOrderId: string;
  priceUsd: number;
  balanceAfterUsd: number;
}

export interface PlusOrderStatus {
  orderNumber: number;
  serviceName: string;
  quantity: number;
  remains: number;
  /** Raw string as returned — only "In progress" confirmed so far, no full enum documented. */
  status: string;
  priceUsd: number;
}

export class PlusClient {
  constructor(private readonly config: PlusClientConfig) {}

  private async requestJson<T extends { success: boolean }>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const rawText = await response.text();
    let body: unknown;
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        body = rawText;
      }
    }

    // Some Plus responses may return 200 with success:false — check both.
    if (!response.ok || (body as { success?: boolean } | undefined)?.success === false) {
      throw new PlusApiError(response.status, body, `Plus API request failed: ${response.status} ${path}`);
    }

    return body as T;
  }

  /** GET ?action=balance — this reseller account's OWN Plus balance, not a customer's. */
  async getBalance(): Promise<PlusBalance> {
    const query = new URLSearchParams({ action: "balance", api_key: this.config.apiKey });
    const result = await this.requestJson<{
      success: boolean;
      balance_usd: number;
      balance_formatted: string;
      user_id: number;
    }>(`?${query.toString()}`);
    return { balanceUsd: result.balance_usd, balanceFormatted: result.balance_formatted, userId: result.user_id };
  }

  /** GET ?action=services — flat list, no category grouping on Plus's side. */
  async getServices(): Promise<PlusService[]> {
    const query = new URLSearchParams({ action: "services", api_key: this.config.apiKey });
    const result = await this.requestJson<{ success: boolean; services: RawPlusService[] }>(`?${query.toString()}`);
    return result.services.map((s) => ({
      serviceId: s.service_id,
      name: s.name,
      min: s.min,
      max: s.max,
      pricePer1000Usd: s.price_per_1000_usd,
    }));
  }

  /**
   * POST { action: "order", ... } — no idempotency/client-reference parameter exists
   * here. See the warning in smm-supplier.interface.ts.
   */
  async addOrder(input: { serviceId: number; quantity: number; link: string }): Promise<PlusOrderResult> {
    const result = await this.requestJson<{
      success: boolean;
      order_number: number;
      smm_order_id: string;
      price_usd: number;
      balance_after_usd: number;
    }>("", {
      method: "POST",
      body: JSON.stringify({ action: "order", service_id: input.serviceId, quantity: input.quantity, link: input.link }),
    });
    return {
      orderNumber: result.order_number,
      smmOrderId: result.smm_order_id,
      priceUsd: result.price_usd,
      balanceAfterUsd: result.balance_after_usd,
    };
  }

  /** GET ?action=order_status&order_number=... — keyed on Plus's own order_number, not smm_order_id. */
  async getOrderStatus(orderNumber: number): Promise<PlusOrderStatus> {
    const query = new URLSearchParams({
      action: "order_status",
      order_number: String(orderNumber),
      api_key: this.config.apiKey,
    });
    const result = await this.requestJson<{
      success: boolean;
      order_number: number;
      service_name: string;
      quantity: number;
      remains: number;
      status: string;
      price_usd: number;
    }>(`?${query.toString()}`);
    return {
      orderNumber: result.order_number,
      serviceName: result.service_name,
      quantity: result.quantity,
      remains: result.remains,
      status: result.status,
      priceUsd: result.price_usd,
    };
  }
}

export function createPlusClientFromEnv(): PlusClient {
  if (!env.PLUS_API_KEY) {
    throw new Error("PLUS_API_KEY must be set in the environment to use the Plus client");
  }
  return new PlusClient({ baseUrl: env.PLUS_BASE_URL, apiKey: env.PLUS_API_KEY });
}
