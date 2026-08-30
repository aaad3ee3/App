import { env } from "../../config/env";

/**
 * Thin client for Resala (https://resala.ly), an SMS/OTP delivery service for Libyan
 * phone numbers. Fills the gap `lib/sms-sender.ts` was left generic for: "Libya has no
 * mainstream programmable-SMS provider" — see otp.service.ts, which uses `sendPin` as the
 * OTP delivery mechanism when `RESALA_API_TOKEN` is configured.
 *
 * Auth is a bearer token, always sent from the backend — this client must never be
 * imported into any code that ships to a browser or the mobile app.
 */
export class ResalaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
  }
}

/** 401 — RESALA_API_TOKEN is missing or wrong. */
export class ResalaAuthError extends ResalaApiError {}

/** 403 — the token's account lacks permission for this endpoint. */
export class ResalaPermissionError extends ResalaApiError {}

/** 422 — validation errors, keyed by field name (e.g. `{ phone: ["..."] }`). */
export class ResalaValidationError extends ResalaApiError {
  constructor(status: number, body: unknown, message: string, public readonly fieldErrors: Record<string, string[]>) {
    super(status, body, message);
  }
}

/** 400, `type: "InsufficientCredit"` — the account's wallet balance is too low to send. Never auto-retried. */
export class ResalaInsufficientCreditError extends ResalaApiError {}

/** 400, `type: "AccountExpired"` — the Resala account/subscription itself has lapsed. */
export class ResalaAccountExpiredError extends ResalaApiError {}

export interface ResalaClientConfig {
  baseUrl: string;
  apiToken: string;
}

export interface SendPinOptions {
  /** Test mode: no real SMS is sent and no credit is charged. Use outside production. */
  test?: boolean;
  /** Digits in the generated code. Default 6. */
  len?: 4 | 5 | 6;
  /** Shown inside the SMS text as the sending app/brand. */
  serviceName?: string;
  /** Android App Signature hash (max 32 chars) appended to the message for SMS auto-fill. */
  autofill?: string;
}

export interface ResalaPinResult {
  id: string;
  /** The generated verification code. Resala has no server-side verify endpoint — the
   *  caller must store this (with its own expiry) and compare it against what the user
   *  types. See otp.service.ts, which reuses its existing hashed-storage/attempt-limiting
   *  logic for exactly this. */
  pin: string;
  countryCode: string;
  nationalNumber: string;
  content: string;
  createdAt: string;
}

interface RawPinResult {
  id: string;
  pin: string;
  code: string;
  number: string;
  content: string;
  created_at: string;
}

/** One recipient for a template send: the phone plus one key per template variable (`$1`, `$2`, ...). */
export type ResalaTemplateRecord = { phone: string } & Record<string, string>;

export interface ResalaSentViewRow {
  id: string;
  status: "accepted" | "sent" | "delivered" | "undelivered" | string;
  [key: string]: unknown;
}

export interface ResalaSentViewResult {
  data: ResalaSentViewRow[];
  meta: unknown;
}

export interface GetSentViewParams {
  /** e.g. "source:pin" or "source:pin|message". */
  filters?: string;
  page?: number;
  paginate?: number;
  /** e.g. "-created_at" for newest first. */
  sorts?: string;
}

const TIMEOUT_MS = 15_000;
const GET_MAX_RETRIES = 2;
const GET_RETRY_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every Resala error body is `{status, type, message, request_id}`. Their own docs are
 * explicit that `type` is the stable, machine-readable field to branch on — `message` is
 * human-readable, translatable, and can be reworded without notice. Documented values:
 * AccountExpired, InsufficientCredit, BadRequest (400s), Unauthorized/TokenExpired (401),
 * Forbidden (403), NotFound (404), InputValidation (422).
 */
function getErrorType(body: unknown): string | undefined {
  return typeof body === "object" && body !== null ? (body as { type?: unknown }).type as string | undefined : undefined;
}

export class ResalaClient {
  constructor(private readonly config: ResalaClientConfig) {}

  /**
   * Issues one HTTP call. `retry: true` is only ever passed for GET endpoints — POST
   * endpoints here (sendPin, sendTemplateMessage) must never auto-retry: a retried network
   * failure could mean the SMS already went out and gets sent (and charged) a second time.
   */
  private async request<T>(path: string, init: RequestInit & { retry?: boolean } = {}): Promise<T> {
    const { retry = false, ...requestInit } = init;
    const url = `${this.config.baseUrl}${path}`;
    const maxAttempts = retry ? GET_MAX_RETRIES + 1 : 1;

    let lastNetworkError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await sleep(GET_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      // A FormData body (sendTemplateMessage) must NOT get an explicit Content-Type —
      // fetch sets one itself with the correct multipart boundary, and overriding it here
      // would strip the boundary and make Resala reject the request.
      const isFormData = requestInit.body instanceof FormData;
      let response: Response;
      try {
        response = await fetch(url, {
          ...requestInit,
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            Accept: "application/json",
            ...requestInit.headers,
          },
          signal: controller.signal,
        });
      } catch (err) {
        lastNetworkError = err;
        clearTimeout(timeout);
        continue; // network/timeout failure — retry (GET only) or fall through to throw below
      } finally {
        clearTimeout(timeout);
      }

      const rawText = await response.text();
      let body: unknown;
      try {
        body = rawText ? JSON.parse(rawText) : undefined;
      } catch {
        body = rawText;
      }

      if (response.ok) {
        return body as T;
      }

      const errorType = getErrorType(body);

      // `type`-based checks first, per Resala's own docs — falls back to the HTTP status
      // alone only for the (undocumented, shouldn't happen) case of a missing `type`.
      if (errorType === "AccountExpired") {
        throw new ResalaAccountExpiredError(response.status, body, "Resala account has expired — renew it in the Resala dashboard");
      }
      if (errorType === "InsufficientCredit") {
        throw new ResalaInsufficientCreditError(response.status, body, "Resala account balance is insufficient to send this message");
      }
      if (errorType === "Unauthorized" || errorType === "TokenExpired" || response.status === 401) {
        throw new ResalaAuthError(401, body, "Resala rejected the request — check RESALA_API_TOKEN");
      }
      if (errorType === "Forbidden" || response.status === 403) {
        throw new ResalaPermissionError(403, body, "This Resala account does not have permission for this endpoint");
      }
      if (errorType === "InputValidation" || response.status === 422) {
        const fieldErrors = (typeof body === "object" && body !== null ? (body as { errors?: Record<string, string[]> }).errors : undefined) ?? {};
        const flat = Object.entries(fieldErrors)
          .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
          .join("; ");
        throw new ResalaValidationError(422, body, `Resala validation failed: ${flat || rawText}`, fieldErrors);
      }
      // A 5xx is retried the same as a network failure (GET only) — everything else
      // (other 4xx) fails immediately since retrying would not change the outcome.
      if (response.status >= 500 && retry && attempt < maxAttempts - 1) {
        lastNetworkError = new ResalaApiError(response.status, body, `Resala API request failed: ${response.status} ${path}`);
        continue;
      }
      throw new ResalaApiError(response.status, body, `Resala API request failed: ${response.status} ${path}`);
    }

    throw lastNetworkError instanceof Error
      ? new ResalaApiError(0, null, `Failed to reach Resala: ${lastNetworkError.message}`)
      : new ResalaApiError(0, null, "Failed to reach Resala");
  }

  /**
   * POST /pins — sends a verification code by SMS. Resala generates the code itself and
   * returns it in `pin`; there is no separate verify endpoint. Never auto-retried: a
   * retried call after a network failure could send (and charge for) a duplicate SMS.
   */
  async sendPin(phone: string, options: SendPinOptions = {}): Promise<ResalaPinResult> {
    // Built by hand rather than via URLSearchParams: the spec's own example is a bare
    // `?test` flag with no value (`POST /pins?test`), and URLSearchParams.set("test", "")
    // would instead render `test=`. Laravel-style backends treat both as "key present",
    // but there's no reason to deviate from the documented exact form.
    const parts: string[] = [];
    if (options.test) parts.push("test");
    if (options.len) parts.push(`len=${options.len}`);
    if (options.serviceName) parts.push(`service_name=${encodeURIComponent(options.serviceName)}`);
    if (options.autofill) parts.push(`autofill=${encodeURIComponent(options.autofill.slice(0, 32))}`);
    const queryString = parts.join("&");

    const result = await this.request<RawPinResult>(`/pins${queryString ? `?${queryString}` : ""}`, {
      method: "POST",
      body: JSON.stringify({ phone }),
    });

    return {
      id: result.id,
      pin: result.pin,
      countryCode: result.code,
      nationalNumber: result.number,
      content: result.content,
      createdAt: result.created_at,
    };
  }

  /**
   * POST /messages/send-template — sends a pre-approved template to one or more
   * recipients in one call. `templateId` is copied from the Resala dashboard's message
   * templates page. Never auto-retried, for the same reason as sendPin. Deliberately never
   * passes `?test` here even outside production: Resala requires available free-message
   * quota for test mode on this endpoint and otherwise returns 400 — callers that want a
   * dry run should send to a small real recipient list instead.
   *
   * This endpoint is multipart/form-data, not JSON: `records` is a single form field
   * holding the recipient array JSON-stringified as a string (confirmed against Resala's
   * own Postman docs — a JSON body is silently rejected).
   */
  async sendTemplateMessage(templateId: string, records: ResalaTemplateRecord[]): Promise<unknown> {
    const form = new FormData();
    form.set("records", JSON.stringify(records));
    return this.request(`/messages/send-template?sms_template_id=${encodeURIComponent(templateId)}`, {
      method: "POST",
      body: form,
    });
  }

  /**
   * GET /sent-view — paginated delivery log. Safe to retry: read-only, so a retried
   * network failure can never double-send or double-charge.
   */
  async getSentView(params: GetSentViewParams = {}): Promise<ResalaSentViewResult> {
    const query = new URLSearchParams();
    if (params.filters) query.set("filters", params.filters);
    if (params.page) query.set("page", String(params.page));
    if (params.paginate) query.set("paginate", String(params.paginate));
    if (params.sorts) query.set("sorts", params.sorts);
    const queryString = query.toString();

    return this.request<ResalaSentViewResult>(`/sent-view${queryString ? `?${queryString}` : ""}`, {
      method: "GET",
      retry: true,
    });
  }
}

/** True when RESALA_API_TOKEN is configured — the gate otp.service.ts uses to pick Resala over the generic SMS gateway. */
export function isResalaConfigured(): boolean {
  return Boolean(env.RESALA_API_TOKEN);
}

export function createResalaClientFromEnv(): ResalaClient {
  if (!env.RESALA_API_TOKEN) {
    throw new Error("RESALA_API_TOKEN must be set in the environment to use the Resala client");
  }
  return new ResalaClient({ baseUrl: env.RESALA_BASE_URL, apiToken: env.RESALA_API_TOKEN });
}
