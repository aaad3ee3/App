import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import * as favoritesService from "../../src/modules/favorites/favorites.service";
import { createTestCategory, createTestProduct, createTestUser, resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe("favorites", () => {
  it("adds, lists, and removes a favorite", async () => {
    const { user } = await createTestUser();
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard", name: "Test Card", sellPrice: 15 });

    await favoritesService.addFavorite(user.id, product.id);

    const ids = await favoritesService.listMyFavoriteIds(user.id);
    expect(ids).toEqual([product.id]);

    const { items } = await favoritesService.listMyFavorites(user.id);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(product.id);
    expect(items[0].category.kind).toBe("giftcard");

    await favoritesService.removeFavorite(user.id, product.id);
    expect(await favoritesService.listMyFavoriteIds(user.id)).toEqual([]);
  });

  it("starring the same product twice is a no-op, not a duplicate row", async () => {
    const { user } = await createTestUser();
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard" });

    await favoritesService.addFavorite(user.id, product.id);
    await favoritesService.addFavorite(user.id, product.id);

    const rows = await db("favorites").where({ user_id: user.id, product_id: product.id });
    expect(rows).toHaveLength(1);
  });

  it("rejects favoriting a product that doesn't exist", async () => {
    const { user } = await createTestUser();
    await expect(
      favoritesService.addFavorite(user.id, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("favorites are private per user", async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const category = await createTestCategory({ kind: "giftcard" });
    const product = await createTestProduct(category.id, { kind: "giftcard" });

    await favoritesService.addFavorite(userA.id, product.id);

    expect(await favoritesService.listMyFavoriteIds(userB.id)).toEqual([]);
  });
});
