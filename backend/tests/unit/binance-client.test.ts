import { afterEach, describe, expect, it, vi } from "vitest";
import { BinanceApiError, BinanceClient } from "../../src/adapters/binance/binance.client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BinanceClient.getPayTransactions", () => {
  const client = new BinanceClient({ apiKey: "test-key", apiSecret: "test-secret" });

  it("filters out an outbound transfer (this account as payer)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: [
            {
              orderId: "IN-1",
              transactionId: "TXN-IN",
              amount: "10",
              currency: "USDT",
              uid: 999,
              payerInfo: { binanceId: 111, name: "Payer" }, // different from uid => inbound
            },
            {
              orderId: "OUT-1",
              transactionId: "TXN-OUT",
              amount: "5",
              currency: "USDT",
              uid: 999,
              payerInfo: { binanceId: 999, name: "Me" }, // same as uid => this account sent it
            },
          ],
        })
      )
    );

    const result = await client.getPayTransactions();
    expect(result).toHaveLength(1);
    expect(result[0]!.orderId).toBe("IN-1");
  });

  it("drops non-positive amounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: [{ orderId: "ZERO", transactionId: "TXN-0", amount: "0", currency: "USDT" }],
        })
      )
    );

    expect(await client.getPayTransactions()).toHaveLength(0);
  });

  it("surfaces a 451 geo-block as a clear BinanceApiError", async () => {
    // A fresh Response per call — a Response body can only be read (.text()) once.
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(451, { msg: "blocked" }))));

    await expect(client.getPayTransactions()).rejects.toThrow(BinanceApiError);
    await expect(client.getPayTransactions()).rejects.toThrow(/geolocation/);
  });

  it("wraps a network failure as a BinanceApiError rather than an unhandled rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );

    await expect(client.getPayTransactions()).rejects.toThrow(BinanceApiError);
  });
});
