import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../../src/db/knex";
import { getRedis } from "../../src/lib/redis";
import { createTestCategory, createTestProduct, createTestSession, createTestUser, creditTestWallet, resetDb } from "../helpers";

/**
 * Proves the property that actually matters about the Redis store: two API instances
 * share one budget.
 *
 * With the default in-memory store each process keeps its own tally, so running two
 * instances silently doubles every limit — a failure with no visible symptom until
 * someone abuses it. These tests run only when REDIS_URL is set (CI and any environment
 * that has Redis); they skip cleanly otherwise rather than failing the suite.
 */
const REDIS_URL = process.env.REDIS_URL;
const describeIfRedis = REDIS_URL ? describe : describe.skip;

describeIfRedis("rate limiting via Redis", () => {
  let instanceA: FastifyInstance;
  let instanceB: FastifyInstance;

  beforeAll(async () => {
    // Imported lazily so config/env reads REDIS_URL from the environment above.
    const { buildApp } = await import("../../src/app");
    instanceA = buildApp();
    instanceB = buildApp();
    await Promise.all([instanceA.ready(), instanceB.ready()]);
  });

  beforeEach(async () => {
    await resetDb();
    // Clear only this app's namespace so a shared Redis isn't disturbed.
    const redis = getRedis();
    if (redis) {
      const keys = await redis.keys("sayeh-rl:*");
      if (keys.length > 0) await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await instanceA?.close();
    await instanceB?.close();
    const redis = getRedis();
    if (redis) await redis.quit().catch(() => undefined);
    await db.destroy();
  });

  it("counts one user's requests across separate instances", async () => {
    const { user, wallet } = await createTestUser({ email: "shared-budget@example.com" });
    const token = await createTestSession(user.id);
    await creditTestWallet(user.id, wallet.id, 10_000);

    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 1 });

    const order = (app: FastifyInstance) =>
      app.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: { product_id: product.id },
      });

    // Alternate between the two instances. RATE_LIMIT_ORDER_MAX defaults to 10/min, so
    // if each instance counted separately, 14 alternating requests (7 each) would all
    // pass and this test would fail — which is exactly the regression it guards against.
    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      const res = await order(i % 2 === 0 ? instanceA : instanceB);
      statuses.push(res.statusCode);
    }

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(10);
  });

  it("keeps separate users on separate budgets", async () => {
    const alice = await createTestUser({ email: "redis-alice@example.com" });
    const bob = await createTestUser({ email: "redis-bob@example.com" });
    const aliceToken = await createTestSession(alice.user.id);
    const bobToken = await createTestSession(bob.user.id);
    await creditTestWallet(alice.user.id, alice.wallet.id, 10_000);
    await creditTestWallet(bob.user.id, bob.wallet.id, 10_000);

    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 1 });

    for (let i = 0; i < 12; i += 1) {
      await instanceA.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { product_id: product.id },
      });
    }

    const bobResponse = await instanceB.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { product_id: product.id },
    });

    expect(bobResponse.statusCode).not.toBe(429);
  });
});
