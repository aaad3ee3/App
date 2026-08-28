import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { db } from "../../src/db/knex";
import { createTestCategory, createTestProduct, resetDb } from "../helpers";

/**
 * A category with nothing available inside it used to still appear in the browse grid
 * (showing "لا توجد منتجات" when tapped) — a dead end that reads as a broken shelf. See
 * catalog.service.ts listCategories.
 */
describe("catalog browse — empty categories are hidden from customers", () => {
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

  it("excludes a category that has zero available products", async () => {
    const withProducts = await createTestCategory({ kind: "giftcard", name: "بها منتجات" });
    await createTestProduct(withProducts.id, { available: true });

    const empty = await createTestCategory({ kind: "giftcard", name: "فاضية تماماً" });
    void empty;

    const res = await app.inject({ method: "GET", url: "/api/v1/catalog/categories?kind=giftcard" });
    expect(res.statusCode).toBe(200);
    const names = JSON.parse(res.body).items.map((c: { name: string }) => c.name);
    expect(names).toContain("بها منتجات");
    expect(names).not.toContain("فاضية تماماً");
  });

  it("excludes a category whose only products are all unavailable", async () => {
    const category = await createTestCategory({ kind: "giftcard", name: "كلها متوقفة" });
    await createTestProduct(category.id, { available: false });

    const res = await app.inject({ method: "GET", url: "/api/v1/catalog/categories?kind=giftcard" });
    const names = JSON.parse(res.body).items.map((c: { name: string }) => c.name);
    expect(names).not.toContain("كلها متوقفة");
  });

  it("still lists it for the admin dashboard, which needs to see and manage empty categories", async () => {
    const { listAllCategoriesAdmin } = await import("../../src/modules/catalog/catalog.repository");
    const empty = await createTestCategory({ kind: "giftcard", name: "فاضية للأدمن" });

    const adminCategories = await listAllCategoriesAdmin();
    expect(adminCategories.some((c) => c.id === empty.id)).toBe(true);
  });
});
