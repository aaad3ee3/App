import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { db } from "../../src/db/knex";
import { createTestCategory, createTestProduct, createTestSession, createTestUser, creditTestWallet, resetDb } from "../helpers";

/**
 * These are regression tests for security properties that are easy to break silently.
 *
 * The per-user rate limit in particular depends on the auth hook running at `onRequest`
 * and the limiter at `preHandler` — an ordering that is invisible at the call site and
 * would otherwise fail open (falling back to an IP key, which is identical for every
 * caller in a test run and behind a proxy in production).
 */
describe("security", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.destroy();
  });

  async function buildTestApp(): Promise<FastifyInstance> {
    const instance = buildApp();
    await instance.ready();
    return instance;
  }

  it("rate limits order creation per user, not globally", async () => {
    app = await buildTestApp();

    const alice = await createTestUser({ email: "alice-rl@example.com" });
    const bob = await createTestUser({ email: "bob-rl@example.com" });
    const aliceToken = await createTestSession(alice.user.id);
    const bobToken = await createTestSession(bob.user.id);
    await creditTestWallet(alice.user.id, alice.wallet.id, 10_000);
    await creditTestWallet(bob.user.id, bob.wallet.id, 10_000);

    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 1 });

    const order = (token: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: { product_id: product.id },
      });

    // Burn through Alice's quota (RATE_LIMIT_ORDER_MAX defaults to 10/min).
    const aliceStatuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      aliceStatuses.push((await order(aliceToken)).statusCode);
    }

    expect(aliceStatuses.filter((s) => s === 429).length).toBeGreaterThan(0);

    // Bob shares the same source IP in tests. If the limiter were keyed by IP (the
    // failure mode this test exists to catch) Alice would have locked Bob out too.
    const bobResponse = await order(bobToken);
    expect(bobResponse.statusCode).not.toBe(429);
  });

  it("returns rate-limit errors in the app's standard error envelope", async () => {
    app = await buildTestApp();

    const user = await createTestUser({ email: "envelope@example.com" });
    const token = await createTestSession(user.user.id);
    await creditTestWallet(user.user.id, user.wallet.id, 10_000);
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 1 });

    let limited: Awaited<ReturnType<typeof app.inject>> | null = null;
    for (let i = 0; i < 15 && !limited; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}` },
        payload: { product_id: product.id },
      });
      if (res.statusCode === 429) limited = res;
    }

    expect(limited).not.toBeNull();
    expect(limited!.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("rejects requests larger than the configured body limit", async () => {
    app = await buildTestApp();

    const user = await createTestUser({ email: "bodylimit@example.com" });
    const token = await createTestSession(user.user.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ product_id: "x".repeat(200_000) }),
    });

    expect(response.statusCode).toBe(413);
  });

  it("rejects unauthenticated access to user and admin endpoints", async () => {
    app = await buildTestApp();

    for (const url of ["/api/v1/orders", "/api/v1/wallet", "/api/v1/admin/users"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, `${url} should require auth`).toBe(401);
    }
  });

  it("leaves the catalog readable without a session, but not buyable", async () => {
    app = await buildTestApp();

    // The shop window is public on purpose (see catalog.routes.ts) — a customer who
    // cannot see the prices has no reason to sign up.
    for (const url of ["/api/v1/catalog/categories", "/api/v1/catalog/search?q=UC"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, `${url} should be public`).toBe(200);
    }

    // Spending money is not. This is the line that matters: opening up browsing must not
    // have opened up ordering with it.
    const order = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      payload: { product_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(order.statusCode).toBe(401);
  });

  it("rejects a non-admin user on admin endpoints", async () => {
    app = await buildTestApp();

    const { user } = await createTestUser({ email: "not-admin@example.com" });
    const token = await createTestSession(user.id);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects a revoked or expired session token", async () => {
    app = await buildTestApp();

    const { user } = await createTestUser({ email: "revoked@example.com" });
    const token = await createTestSession(user.id);
    await db("sessions").update({ revoked_at: new Date() });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/wallet",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects SMS webhook deliveries without a valid signature", async () => {
    app = await buildTestApp();

    const unsigned = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/sms/libyana",
      payload: { sender: "Libyana", text: "تم تحويل 50 دينار" },
    });
    expect(unsigned.statusCode).toBe(401);

    const badSignature = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/sms/libyana",
      headers: { "x-signature": "00".repeat(32) },
      payload: { sender: "Libyana", text: "تم تحويل 50 دينار" },
    });
    expect(badSignature.statusCode).toBe(401);
  });

  it("sets defensive security headers on API responses", async () => {
    app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
  });

  it("does not expose another user's order", async () => {
    app = await buildTestApp();

    const owner = await createTestUser({ email: "owner@example.com" });
    const stranger = await createTestUser({ email: "stranger@example.com" });
    const strangerToken = await createTestSession(stranger.user.id);
    await creditTestWallet(owner.user.id, owner.wallet.id, 1_000);

    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 1 });
    const [order] = await db("orders")
      .insert({
        user_id: owner.user.id,
        product_id: product.id,
        kind: "giftcard",
        quantity: 1,
        unit_price: 1,
        total_price: 1,
        status: "completed",
      })
      .returning("*");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${order.id}`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
