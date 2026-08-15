import { env } from "../../config/env";

/**
 * Thin HTTP client for Libya Play's API (https://api.libyaplay.com/portal). Auth is two
 * plain headers, not bearer/OAuth: `x-api-key` and `x-email`.
 *
 * Response shapes are NOT uniform across endpoints:
 * - `/general/*` and `/digital-products/payment` wrap the payload as `{ status, data }`.
 * - `/digital-products/show-*` (categories/sub-categories/products) return a bare JSON
 *   array — no `{status,data}` wrapper.
 * - `/digital-products/payment` errors (400/422) also use `{status,data}`, but `data` is
 *   a plain error-message string there, not an object.
 * Each client method below unwraps whatever its specific endpoint actually returns —
 * don't assume a shared envelope when adding new endpoints.
 */
export class LibyaPlayApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
  }
}

export interface LibyaPlayClientConfig {
  baseUrl: string;
  apiKey: string;
  email: string;
}

export interface LibyaPlayAppInfo {
  app_name: string;
  app_version: number;
  maintenance: number;
}

export interface LibyaPlayProfile {
  id: number;
  uuid: string;
  name: string;
  phone: string;
  email: string;
  /** Libya Play's OWN wallet balance for this reseller account — not a customer's balance. */
  wallet: number;
  currency_code: string;
}

export interface LibyaPlayCategory {
  id: string;
  name: string;
  rank: number;
  description: string;
  image: string;
  type: string;
}

export interface LibyaPlaySubCategory {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  howToUse: string;
  policy: string;
  image: string;
  productsCount: number;
}

export interface LibyaPlayProduct {
  id: string;
  subCategoryId: string;
  name: string;
  description: string;
  image: string;
  price: number;
  available: boolean;
  currencyCode: string;
  proType: "auto" | "digt";
}

export interface LibyaPlayPaymentResult {
  secretNumber: string;
  serialNumber: string;
  expDate: string;
}

// Raw wire shapes, snake_case as Libya Play actually sends them.
interface RawCategory {
  id: string;
  name: string;
  rank: number;
  description: string;
  image: string;
  type: string;
}
interface RawSubCategory {
  id: string;
  categoyID: string; // sic — Libya Play's own typo, not ours
  name: string;
  description: string;
  how_to_use: string;
  policy: string;
  image: string;
  products_count: number;
}
interface RawProduct {
  id: string;
  subCategoyID: string; // sic
  name: string;
  description: string;
  image: string;
  price: number;
  available: number | boolean;
  currency_code: string;
  pro_type: string;
}

export class LibyaPlayClient {
  constructor(private readonly config: LibyaPlayClientConfig) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        "x-api-key": this.config.apiKey,
        "x-email": this.config.email,
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

    if (!response.ok) {
      throw new LibyaPlayApiError(
        response.status,
        body,
        `Libya Play API request failed: ${response.status} ${path}`
      );
    }

    return body as T;
  }

  /** GET /general/app-info — connectivity/credentials smoke check. */
  async getAppInfo(): Promise<LibyaPlayAppInfo> {
    const result = await this.request<{ status: boolean; data: LibyaPlayAppInfo }>("/general/app-info");
    return result.data;
  }

  /** GET /general/profile — includes this reseller account's OWN Libya Play wallet balance. */
  async getProfile(): Promise<LibyaPlayProfile> {
    const result = await this.request<{ status: boolean; data: LibyaPlayProfile }>("/general/profile");
    return result.data;
  }

  /** GET /digital-products/show-categories — bare array response, no {status,data} wrapper. */
  async getCategories(): Promise<LibyaPlayCategory[]> {
    const raw = await this.request<RawCategory[]>("/digital-products/show-categories");
    return raw.map((c) => ({
      id: c.id,
      name: c.name,
      rank: c.rank,
      description: c.description,
      image: c.image,
      type: c.type,
    }));
  }

  /** GET /digital-products/show-sub-categories/{categoryId} — bare array response. */
  async getSubCategories(categoryId: string): Promise<LibyaPlaySubCategory[]> {
    const raw = await this.request<RawSubCategory[]>(
      `/digital-products/show-sub-categories/${encodeURIComponent(categoryId)}`
    );
    return raw.map((s) => ({
      id: s.id,
      categoryId: s.categoyID,
      name: s.name,
      description: s.description,
      howToUse: s.how_to_use,
      policy: s.policy,
      image: s.image,
      productsCount: s.products_count,
    }));
  }

  /**
   * GET /digital-products/show-products-by-sub-category/{subCategoryId} — bare array.
   * `proType` filters to Libya Play's `pro_type` query param: "digt" = direct/synchronous
   * pay (what we use), "auto" = behaves like their async /social flow (not implemented here).
   */
  async getProductsBySubCategory(subCategoryId: string, proType?: "auto" | "digt"): Promise<LibyaPlayProduct[]> {
    const query = proType ? `?pro_type=${proType}` : "";
    const raw = await this.request<RawProduct[]>(
      `/digital-products/show-products-by-sub-category/${encodeURIComponent(subCategoryId)}${query}`
    );
    return raw.map((p) => ({
      id: p.id,
      subCategoryId: p.subCategoyID,
      name: p.name,
      description: p.description,
      image: p.image,
      price: p.price,
      available: Boolean(p.available),
      currencyCode: p.currency_code,
      proType: p.pro_type === "auto" ? "auto" : "digt",
    }));
  }

  /**
   * POST /digital-products/payment — form-urlencoded (NOT JSON, unlike every other write
   * endpoint here). Synchronous: the card code comes back in this same response.
   *
   * No idempotency-key parameter exists on this endpoint — see the warning in
   * giftcard-supplier.interface.ts. Draws from Libya Play's OWN wallet balance for this
   * reseller account (see getProfile()), not any of our customers' balances.
   */
  async pay(input: { productId: string; env?: "sandbox" | "production" }): Promise<LibyaPlayPaymentResult> {
    const form = new URLSearchParams();
    form.set("productID", input.productId);
    if (input.env) form.set("env", input.env);

    const result = await this.request<{
      status: boolean;
      data: { secretNumber: string; serialNumber: string; exp_date: string };
    }>("/digital-products/payment", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    return {
      secretNumber: result.data.secretNumber,
      serialNumber: result.data.serialNumber,
      expDate: result.data.exp_date,
    };
  }
}

export function createLibyaPlayClientFromEnv(): LibyaPlayClient {
  if (!env.LIBYA_PLAY_API_KEY || !env.LIBYA_PLAY_EMAIL) {
    throw new Error(
      "LIBYA_PLAY_API_KEY and LIBYA_PLAY_EMAIL must be set in the environment to use the Libya Play client"
    );
  }
  return new LibyaPlayClient({
    baseUrl: env.LIBYA_PLAY_BASE_URL,
    apiKey: env.LIBYA_PLAY_API_KEY,
    email: env.LIBYA_PLAY_EMAIL,
  });
}
