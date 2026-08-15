import { env } from "../../config/env";

/**
 * Thin HTTP client for Libya Play's API (https://api.libyaplay.com/portal). Auth is two
 * plain headers, not bearer/OAuth — confirmed against the real `/general/app-info`
 * endpoint (the only one documented so far, see LibyaPlayAdapter for what's still
 * missing: catalog listing, purchase/redeem, order status).
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

  /** GET /general/app-info — the one confirmed-working endpoint; useful as a credentials/connectivity check. */
  async getAppInfo(): Promise<LibyaPlayAppInfo> {
    const result = await this.request<{ status: boolean; data: LibyaPlayAppInfo }>("/general/app-info");
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
