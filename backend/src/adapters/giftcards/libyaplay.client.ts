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

export interface LibyaPlaySocialCategory {
  id: number;
  name: string;
  note: string;
  image: string;
  productsCount: number;
}

export interface LibyaPlaySocialProduct {
  id: number;
  categoryId: number;
  name: string;
  image: string;
  /** Already a per-unit price (unlike digt's flat price or Plus's per-1000 rate). */
  sellingPrice: number;
  currencyCode: string;
  /** Field labels (Arabic, as Libya Play names them) the customer must fill in, e.g.
   *  `["معرف المستخدم"]` — passed back verbatim as the `params` object's keys on purchase. */
  params: string[];
  qtyMin: number;
  qtyMax: number;
  available: boolean;
}

export interface LibyaPlaySocialPayResult {
  orderId: number;
  orderUuid: string;
  /** Libya Play's own vocabulary: 'pending' | 'accept' | 'reject' | 'wait'. Never final at
   *  purchase time — see poll-social-orders.job.ts. */
  status: string;
  externalId: string;
  total: number;
  currencyCode: string;
  idempotent: boolean;
}

export interface LibyaPlaySocialOrderStatus {
  id: number;
  status: string;
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

interface RawSocialCategory {
  id: number;
  external_id: string | null;
  name: string;
  note: string;
  photo: string;
  parent_id: number;
  parent_name: string | null;
  sort: number;
  products_count: number;
}
interface RawSocialProduct {
  id: number;
  name: string;
  photo: string;
  selling_price: string;
  final_price: string;
  converted_price: string;
  currency_code: string;
  currency_sign: string;
  discount: number;
  params: string[];
  qty_values: { min: string; max: string };
  product_type: string;
  available: boolean;
  category_name: string;
  category_id: number;
}
interface RawSocialProductPage {
  data: RawSocialProduct[];
  last_page: number;
}
interface RawSocialPayData {
  order_id: number;
  order_uuid: string;
  status: string;
  external_id: string;
  total: string;
  currency_code: string;
  idempotent: boolean;
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
      // Confirmed at runtime to sometimes arrive as a numeric string despite the docs'
      // declared type — coerce here rather than trust the wire shape, same reasoning as
      // the `available` coercion right below.
      price: Number(p.price),
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

  /**
   * GET /social/categories — {status,data} wrapper, bare array (not paginated). Each
   * category is one live-app platform (Azal Live, imo, ...) — today's catalog has no
   * further nesting here, unlike the digt hierarchy's category -> sub-category -> product.
   */
  async getSocialCategories(): Promise<LibyaPlaySocialCategory[]> {
    const result = await this.request<{ status: boolean; data: RawSocialCategory[] }>("/social/categories");
    return result.data.map((c) => ({
      id: c.id,
      name: c.name,
      note: c.note,
      image: c.photo,
      productsCount: c.products_count,
    }));
  }

  /**
   * GET /social/products-by-category/{id} — {status,data} wrapper around a Laravel-style
   * paginated envelope. Walks every page: today's catalog never shows more than one, but
   * nothing about the docs guarantees that stays true.
   */
  async getSocialProductsByCategory(categoryId: number): Promise<LibyaPlaySocialProduct[]> {
    const products: LibyaPlaySocialProduct[] = [];
    let page = 1;
    for (;;) {
      const result = await this.request<{ status: boolean; data: RawSocialProductPage }>(
        `/social/products-by-category/${categoryId}?page=${page}`
      );
      for (const p of result.data.data) {
        products.push({
          id: p.id,
          categoryId: p.category_id,
          name: p.name,
          image: p.photo,
          sellingPrice: Number(p.selling_price),
          currencyCode: p.currency_code,
          params: p.params,
          qtyMin: Number(p.qty_values?.min ?? 1),
          qtyMax: Number(p.qty_values?.max ?? p.qty_values?.min ?? 1),
          available: Boolean(p.available),
        });
      }
      if (page >= result.data.last_page) break;
      page += 1;
    }
    return products;
  }

  /**
   * POST /social/pay — JSON body (unlike /digital-products/payment's form-urlencoded).
   * Asynchronous: the returned `status` (every confirmed example: "wait") is NOT the final
   * outcome — the live-app credit happens on Libya Play's side afterward. Poll
   * getSocialOrderAndStatus for the real result (see poll-social-orders.job.ts).
   *
   * `orderUuid` doubles as Libya Play's own idempotency key for this endpoint specifically
   * (unlike /digital-products/payment, which has none — see the warning in
   * giftcard-supplier.interface.ts) — always pass this order's own id so a retried call
   * after a network failure is provably safe rather than a guessed risk.
   */
  async paySocial(input: {
    productId: number;
    qty: number;
    params: Record<string, string>;
    orderUuid: string;
    env?: "sandbox" | "production";
  }): Promise<LibyaPlaySocialPayResult> {
    const result = await this.request<{ status: boolean; data: RawSocialPayData }>("/social/pay", {
      method: "POST",
      body: JSON.stringify({
        product_id: input.productId,
        qty: input.qty,
        params: input.params,
        order_uuid: input.orderUuid,
        env: input.env,
      }),
    });
    return {
      orderId: result.data.order_id,
      orderUuid: result.data.order_uuid,
      status: result.data.status,
      externalId: result.data.external_id,
      total: Number(result.data.total),
      currencyCode: result.data.currency_code,
      idempotent: Boolean(result.data.idempotent),
    };
  }

  /**
   * GET /social/order-and-status — {status,data} wrapper, bare array, NOT paginated. The
   * `status` query filter is left unset so one call refreshes every in-flight order at
   * once — see poll-social-orders.job.ts.
   */
  async getSocialOrderAndStatus(): Promise<LibyaPlaySocialOrderStatus[]> {
    const result = await this.request<{ status: boolean; data: LibyaPlaySocialOrderStatus[] }>(
      "/social/order-and-status"
    );
    return result.data;
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
