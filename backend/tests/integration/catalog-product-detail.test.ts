import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { db } from "../../src/db/knex";
import { createTestCategory, createTestProduct, resetDb } from "../helpers";

/**
 * GET /catalog/products/:id — used by the mobile app's "order again" button, which only
 * has a past order's product id on hand (not the category it lives in).
 */
describe("catalog — single product lookup", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDb();
    if (!app) {
      app = buildApp();
      await app.ready();
    }
  });

  afterAll(async () => {
    await app?.close();
    await db.destroy();
  });

  it("returns an available product's public view, unauthenticated", async () => {
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { name: "Netflix 10$", sellPrice: 15 });

    const res = await app.inject({ method: "GET", url: `/api/v1/catalog/products/${product.id}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(product.id);
    expect(body.name).toBe("Netflix 10$");
    expect(body.price).toBe("15.0000");
  });

  it("404s for a product that's no longer available", async () => {
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { available: false });

    const res = await app.inject({ method: "GET", url: `/api/v1/catalog/products/${product.id}` });
    expect(res.statusCode).toBe(404);
  });

  it("404s for a product whose category has since been disabled", async () => {
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id);
    await db("categories").where({ id: category.id }).update({ enabled: false });

    const res = await app.inject({ method: "GET", url: `/api/v1/catalog/products/${product.id}` });
    expect(res.statusCode).toBe(404);
  });

  it("404s for an unknown product id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/catalog/products/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });
});
