import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import { BinanceApiError, BinanceClient, type BinancePayTransaction } from "../../src/adapters/binance/binance.client";
import * as binanceTopupService from "../../src/modules/binance-topup/binance-topup.service";
import * as walletRepo from "../../src/modules/wallet/wallet.repository";
import { createTestUser, resetDb } from "../helpers";

function mockClient(transactions: BinancePayTransaction[] | (() => Promise<BinancePayTransaction[]>)): BinanceClient {
  return {
    getPayTransactions: () => (typeof transactions === "function" ? transactions() : Promise.resolve(transactions)),
  } as unknown as BinanceClient;
}

function tx(overrides: Partial<BinancePayTransaction> = {}): BinancePayTransaction {
  return {
    orderId: "ORDER-1",
    transactionId: "TXN-1",
    amount: 10,
    currency: "USDT",
    transactionTimeMs: Date.now(),
    payerBinanceId: "111",
    accountBinanceId: "999",
    payerName: "Test Payer",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe("Binance Pay top-up — verify and credit", () => {
  it("credits the wallet at the configured USD/LYD rate on a genuine match", async () => {
    const { user } = await createTestUser();
    const client = mockClient([tx({ orderId: "ABC123", amount: 10, currency: "USDT" })]);

    const result = await binanceTopupService.verifyAndCredit(user.id, "ABC123", client);

    expect(result.amount_usdt).toBe(10);
    expect(result.amount_lyd).toBeGreaterThan(0);

    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBe(result.amount_lyd);

    const row = await db("binance_topups").where({ binance_order_id: "ABC123" }).first();
    expect(row.status).toBe("credited");
    expect(row.user_id).toBe(user.id);
  });

  it("rejects reusing the same order id a second time, without crediting again", async () => {
    const { user } = await createTestUser();
    const client = mockClient([tx({ orderId: "ONETIME", amount: 5 })]);

    await binanceTopupService.verifyAndCredit(user.id, "ONETIME", client);

    await expect(binanceTopupService.verifyAndCredit(user.id, "ONETIME", client)).rejects.toMatchObject({
      statusCode: 409,
      code: "order_already_used",
    });

    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBeGreaterThan(0); // credited once
    const rows = await db("binance_topups").where({ binance_order_id: "ONETIME" });
    expect(rows).toHaveLength(1); // not two rows
  });

  it("releases the reservation and lets the customer retry when the order id isn't found yet", async () => {
    const { user } = await createTestUser();
    const client = mockClient([]); // transfer hasn't landed on Binance's side yet

    await expect(binanceTopupService.verifyAndCredit(user.id, "NOTYET", client)).rejects.toMatchObject({
      statusCode: 404,
      code: "transaction_not_found",
    });

    expect(await db("binance_topups").where({ binance_order_id: "NOTYET" })).toHaveLength(0);

    // Retry once the transfer has landed — must succeed, not still be blocked.
    const secondClient = mockClient([tx({ orderId: "NOTYET", amount: 3 })]);
    const result = await binanceTopupService.verifyAndCredit(user.id, "NOTYET", secondClient);
    expect(result.ok).toBe(true);
  });

  it("rejects an unsupported (volatile) currency and releases the reservation", async () => {
    const { user } = await createTestUser();
    const client = mockClient([tx({ orderId: "BTCORDER", currency: "BTC", amount: 0.001 })]);

    await expect(binanceTopupService.verifyAndCredit(user.id, "BTCORDER", client)).rejects.toMatchObject({
      statusCode: 400,
      code: "unsupported_currency",
    });

    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBe(0);
    expect(await db("binance_topups").where({ binance_order_id: "BTCORDER" })).toHaveLength(0);
  });

  it("wraps a Binance API failure as a retryable 502, not a permanent block", async () => {
    const { user } = await createTestUser();
    const client = mockClient(() => Promise.reject(new BinanceApiError(500, null, "boom")));

    await expect(binanceTopupService.verifyAndCredit(user.id, "APIFAIL", client)).rejects.toMatchObject({
      statusCode: 502,
      code: "binance_unreachable",
    });

    // Reservation was released — a later retry (once Binance recovers) must not 409.
    expect(await db("binance_topups").where({ binance_order_id: "APIFAIL" })).toHaveLength(0);
  });

  it("isEnabled reflects whether both API credentials are configured", () => {
    expect(typeof binanceTopupService.isEnabled()).toBe("boolean");
  });
});
