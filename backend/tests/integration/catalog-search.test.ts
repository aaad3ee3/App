import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { db } from "../../src/db/knex";
import { createTestCategory, createTestProduct, createTestSession, createTestUser, resetDb } from "../helpers";

/**
 * Catalog search. Customers do not browse a category tree — they type the name of the
 * thing they want, in whichever spelling comes to mind.
 */
describe("catalog search", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await resetDb();
    const { user } = await createTestUser();
    token = await createTestSession(user.id);

    const pubg = await createTestCategory({ kind: "giftcard", name: "شحن ببجي PUBG" });
    await createTestProduct(pubg.id, { name: "60 UC", sellPrice: 12 });
    await createTestProduct(pubg.id, { name: "325 UC", sellPrice: 55 });

    const psn = await createTestCategory({ kind: "giftcard", name: "بطاقات بلايستيشن" });
    await createTestProduct(psn.id, { name: "PlayStation Plus بطاقة 10$", sellPrice: 70 });

    const smm = await createTestCategory({ kind: "smm", name: "خدمات إنستغرام" });
    await createTestProduct(smm.id, { kind: "smm", name: "متابعين عرب", sellPrice: 9, pricePer1000: true });
  });

  afterAll(async () => {
    await app?.close();
    await db.destroy();
  });

  const search = (query: string) =>
    app.inject({ method: "GET", url: `/api/v1/catalog/search?${query}`, headers: { authorization: `Bearer ${token}` } });

  const names = (res: Awaited<ReturnType<typeof search>>) =>
    (res.json().items as { name: string }[]).map((item) => item.name);

  it("finds products by their own name", async () => {
    const res = await search("q=325");
    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(["325 UC"]);
  });

  it("finds products by their category name", async () => {
    // The product row is called "60 UC" — nothing but the category says PUBG. Without
    // matching the category, the most-searched term in the store would return nothing.
    const res = await search("q=ببجي");
    expect(names(res)).toEqual(expect.arrayContaining(["60 UC", "325 UC"]));
  });

  it("ignores Arabic spelling variants the customer cannot be expected to get right", async () => {
    const res = await search(`q=${encodeURIComponent("انستغرام")}`);
    expect(names(res)).toContain("متابعين عرب");
  });

  it("finds an Arabic-named category from its Latin brand name", async () => {
    // The store's own labels are Arabic, but a customer typing "instagram" in a store
    // that visibly sells Instagram followers must not be told there are no results.
    const res = await search("q=instagram");
    expect(names(res)).toContain("متابعين عرب");

    // And the reverse: an Arabic query against a Latin-named product.
    expect(names(await search(`q=${encodeURIComponent("بلايستيشن")}`))).toContain("PlayStation Plus بطاقة 10$");
  });

  it("is case-insensitive for Latin names", async () => {
    const res = await search("q=playstation");
    expect(names(res)).toContain("PlayStation Plus بطاقة 10$");
  });

  it("narrows the results as more words are typed", async () => {
    const broad = await search("q=UC");
    const narrow = await search("q=325%20UC");

    expect(broad.json().items.length).toBeGreaterThan(narrow.json().items.length);
    expect(names(narrow)).toEqual(["325 UC"]);
  });

  it("ranks a name match above a cheaper category match", async () => {
    // "بطاقة" appears in one product name and in another product's category. The named
    // one wins even though it is the more expensive row.
    const res = await search(`q=${encodeURIComponent("بطاقة")}`);
    expect(names(res)[0]).toBe("PlayStation Plus بطاقة 10$");
  });

  it("filters by kind, so the store tab the customer is on stays honest", async () => {
    const giftcards = await search("q=UC&kind=smm");
    expect(giftcards.json().items).toEqual([]);

    const smm = await search(`q=${encodeURIComponent("متابعين")}&kind=smm`);
    expect(names(smm)).toEqual(["متابعين عرب"]);
  });

  it("returns the category with each result, since the purchase flow depends on it", async () => {
    const res = await search(`q=${encodeURIComponent("متابعين")}`);
    const item = res.json().items[0];

    expect(item.category.kind).toBe("smm");
    expect(item.category.name).toBe("خدمات إنستغرام");
    expect(item.price_per_1000).toBe(true);
  });

  it("hides unavailable products and disabled categories", async () => {
    const hidden = await createTestCategory({ kind: "giftcard", name: "فورتنايت" });
    await createTestProduct(hidden.id, { name: "1000 V-Bucks", sellPrice: 40 });
    await db("categories").where({ id: hidden.id }).update({ enabled: false });

    const pubgCategory = await db("categories").where({ name: "شحن ببجي PUBG" }).first();
    await db("products").where({ category_id: pubgCategory.id, name: "60 UC" }).update({ available: false });

    expect((await search(`q=${encodeURIComponent("فورتنايت")}`)).json().items).toEqual([]);
    expect(names(await search("q=UC"))).toEqual(["325 UC"]);
  });

  it("treats LIKE wildcards as ordinary characters", async () => {
    // Unescaped, "%" would match every product in the store — a one-character catalog dump.
    const res = await search("q=%25");
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);

    // And "_" must not stand in for any single character.
    expect((await search("q=_5%20UC")).json().items).toEqual([]);
  });

  it("rejects an empty or oversized query rather than scanning the catalog", async () => {
    expect((await search("q=")).statusCode).toBe(400);
    expect((await search(`q=${"a".repeat(61)}`)).statusCode).toBe(400);
  });

  it("caps how much one request can pull back", async () => {
    expect((await search("q=UC&limit=500")).statusCode).toBe(400);
    expect((await search("q=UC&limit=1")).json().items).toHaveLength(1);
  });

  it("works without a session, so a visitor can search before signing up", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/catalog/search?q=UC" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
  });
});
