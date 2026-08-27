import { hmacSha256Hex } from "../../lib/crypto";

/**
 * Thin, read-only client for Binance's signed REST API — used to verify inbound Binance
 * Pay transfers against a customer-supplied order id (see binance-topup.service.ts).
 *
 * Deliberately narrow: this only ever calls the Pay-transactions endpoint. The API key
 * this is configured with must have "Enable Reading" ONLY — never trading or withdrawal —
 * see deploy docs. A leaked read-only key can at most see transaction history, not move
 * money.
 */
export class BinanceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
  }
}

export interface BinanceClientConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

export interface BinancePayTransaction {
  orderId: string;
  transactionId: string;
  amount: number;
  currency: string;
  transactionTimeMs: number;
  payerBinanceId: string | null;
  accountBinanceId: string | null;
  payerName: string;
}

interface RawBinancePayTransaction {
  orderId?: string;
  transactionId?: string;
  amount?: string;
  currency?: string;
  transactionTime?: number;
  uid?: number;
  payerInfo?: { binanceId?: number; name?: string };
}

const DEFAULT_BASE_URL = "https://api.binance.com";
const TIMEOUT_MS = 15_000;

export class BinanceClient {
  constructor(private readonly config: BinanceClientConfig) {}

  private sign(params: URLSearchParams): string {
    return hmacSha256Hex(this.config.apiSecret, params.toString());
  }

  private async signedGet<T>(path: string, extraParams: Record<string, string> = {}): Promise<T> {
    const params = new URLSearchParams({
      ...extraParams,
      timestamp: String(Date.now()),
      recvWindow: "10000",
    });
    const signature = this.sign(params);
    const url = `${this.config.baseUrl ?? DEFAULT_BASE_URL}${path}?${params.toString()}&signature=${signature}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { headers: { "X-MBX-APIKEY": this.config.apiKey }, signal: controller.signal });
    } catch (err) {
      throw new BinanceApiError(0, null, `Failed to reach Binance: ${err instanceof Error ? err.message : err}`);
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

    if (response.status === 451) {
      throw new BinanceApiError(
        451,
        body,
        "Binance blocked this request by IP geolocation (commonly US-hosted servers) — host outside the US."
      );
    }
    if (!response.ok) {
      throw new BinanceApiError(response.status, body, `Binance API request failed: ${response.status} ${path}`);
    }
    return body as T;
  }

  /**
   * Last ~90 days of Binance Pay activity on this account (Binance's own window — not
   * configurable). Filters out outbound transfers (this account as payer) — Binance
   * returns both directions in the same list, and crediting a customer for money THEY
   * sent out on our behalf would be a real bug, not a hypothetical one.
   */
  async getPayTransactions(): Promise<BinancePayTransaction[]> {
    const result = await this.signedGet<{ data?: RawBinancePayTransaction[] }>("/sapi/v1/pay/transactions");
    const rows = result.data ?? [];

    const transactions: BinancePayTransaction[] = [];
    for (const row of rows) {
      const amount = Number(row.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue; // negative/zero = outbound or noise

      const accountUid = row.uid;
      const payerUid = row.payerInfo?.binanceId;
      if (accountUid !== undefined && payerUid !== undefined && String(payerUid) === String(accountUid)) {
        continue; // this account was the payer, not the recipient
      }

      transactions.push({
        orderId: row.orderId ?? "",
        transactionId: row.transactionId ?? "",
        amount,
        currency: (row.currency ?? "").toUpperCase(),
        transactionTimeMs: row.transactionTime ?? 0,
        payerBinanceId: row.payerInfo?.binanceId != null ? String(row.payerInfo.binanceId) : null,
        accountBinanceId: accountUid != null ? String(accountUid) : null,
        payerName: row.payerInfo?.name ?? "",
      });
    }
    return transactions;
  }
}
