import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import * as catalogRepo from "../../src/modules/catalog/catalog.repository";
import { syncLibyaPlay, syncLibyaPlaySocial, syncPlus } from "../../src/modules/catalog/catalog-sync.service";
import type { SmmService, SmmSupplierAdapter } from "../../src/adapters/smm/smm-supplier.interface";
import type {
  GiftCardCategory,
  GiftCardSupplierAdapter,
} from "../../src/adapters/giftcards/giftcard-supplier.interface";
import type { SocialCategory, SocialProduct, SocialSupplierAdapter } from "../../src/adapters/social/social-supplier.interface";
import { createTestCategory, resetDb } from "../helpers";

function mockPlusAdapter(services: SmmService[]): SmmSupplierAdapter {
  return {
    listServices: () => Promise.resolve(services),
    addOrder: () => Promise.reject(new Error("not used in these tests")),
    getOrderStatus: () => Promise.reject(new Error("not used in these tests")),
  };
}

function mockLibyaPlayAdapter(categories: GiftCardCategory[]): GiftCardSupplierAdapter {
  return {
    listCategories: () => Promise.resolve(categories),
    // Every category gets one sub-category with no products, purely to exercise the
    // category-upsert (and its icon fallback) without needing product-level fixtures.
    listSubCategories: () => Promise.resolve([]),
    listProducts: () => Promise.resolve([]),
    purchase: () => Promise.reject(new Error("not used in these tests")),
  };
}

function mockLibyaPlaySocialAdapter(categories: SocialCategory[], productsByCategory: Record<string, SocialProduct[]>): SocialSupplierAdapter {
  return {
    listCategories: () => Promise.resolve(categories),
    listProducts: (categoryId: string) => Promise.resolve(productsByCategory[categoryId] ?? []),
    purchase: () => Promise.reject(new Error("not used in these tests")),
    pollStatuses: () => Promise.reject(new Error("not used in these tests")),
  };
}

/**
 * Regression coverage for a real production incident: Libya Play's live API returned
 * `price` as a numeric string ("12.50") despite its documented type being a number.
 * `upsertProduct` used to call `.toFixed()` directly on whatever it was handed, which
 * crashed the entire sync (`input.costPrice.toFixed is not a function`) the first time a
 * real supplier response didn't match its declared TS type. The client-level mapping is
 * now fixed too, but this test targets the repository's own defensive coercion — the
 * single choke point all supplier data passes through — so a similar mismatch from either
 * supplier, today or in the future, degrades to a stored number instead of an outage.
 */
afterAll(async () => {
  await db.destroy();
});

describe("catalog sync — tolerates suppliers sending price fields as strings", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("upsertProduct stores numeric cost/sell prices even when handed strings", async () => {
    const category = await createTestCategory({ kind: "giftcard" });

    const productId = await catalogRepo.upsertProduct({
      categoryId: category.id,
      kind: "giftcard",
      supplier: "libya_play",
      supplierProductRef: "raw-string-price-test",
      supplierSubCategoryRef: null,
      name: "Test Product",
      description: null,
      image: null,
      // Simulates the real Libya Play response shape that crashed sync in production.
      costPrice: "12.50" as unknown as number,
      sellPrice: "15.00" as unknown as number,
      currency: "LYD",
      pricePer1000: false,
      minQuantity: null,
      maxQuantity: null,
      available: true,
    });

    const stored = await catalogRepo.getProductById(productId);
    expect(Number(stored!.cost_price)).toBe(12.5);
    expect(Number(stored!.sell_price)).toBe(15);
  });
});

describe("catalog sync — re-syncing never wipes an admin-set category image", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("preserves a manually-set image across a re-sync where the supplier still sends none", async () => {
    const categoryId = await catalogRepo.upsertCategory({
      kind: "giftcard",
      supplier: "libya_play",
      supplierCategoryRef: "cat-1",
      name: "بطاقات نتفلكس",
      image: null, // most Libya Play categories arrive with no image, as seen in production
    });

    await catalogRepo.updateCategoryImage(categoryId, "https://cdn.example.com/netflix.png");

    // Re-sync: same supplier ref, still no image on their side.
    const resyncedId = await catalogRepo.upsertCategory({
      kind: "giftcard",
      supplier: "libya_play",
      supplierCategoryRef: "cat-1",
      name: "بطاقات نتفلكس",
      image: null,
    });

    expect(resyncedId).toBe(categoryId);
    const categories = await catalogRepo.listAllCategoriesAdmin();
    const category = categories.find((c) => c.id === categoryId);
    expect(category!.image).toBe("https://cdn.example.com/netflix.png");
  });

  it("still adopts the supplier's image once the admin override is cleared", async () => {
    const categoryId = await catalogRepo.upsertCategory({
      kind: "giftcard",
      supplier: "libya_play",
      supplierCategoryRef: "cat-2",
      name: "بطاقات بلايستيشن",
      image: null,
    });
    await catalogRepo.updateCategoryImage(categoryId, "https://cdn.example.com/manual.png");
    await catalogRepo.updateCategoryImage(categoryId, ""); // clears the override

    await catalogRepo.upsertCategory({
      kind: "giftcard",
      supplier: "libya_play",
      supplierCategoryRef: "cat-2",
      name: "بطاقات بلايستيشن",
      image: "https://cdn.libyaplay.com/psn.png",
    });

    const categories = await catalogRepo.listAllCategoriesAdmin();
    const category = categories.find((c) => c.id === categoryId);
    expect(category!.image).toBe("https://cdn.libyaplay.com/psn.png");
  });
});

describe("catalog sync — Libya Play categories fall back to a matched brand icon", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("uses the brand icon when Libya Play sends no image", async () => {
    await syncLibyaPlay(
      mockLibyaPlayAdapter([{ id: "cat-1", name: "بطاقات نتفلكس", image: "", type: "cards" }])
    );

    const categories = await catalogRepo.listAllCategoriesAdmin();
    const netflix = categories.find((c) => c.name === "بطاقات نتفلكس");
    expect(netflix!.image).toBe("https://cdn.simpleicons.org/netflix/E50914");
  });

  it("keeps the supplier's real image over a guessed one when both exist", async () => {
    await syncLibyaPlay(
      mockLibyaPlayAdapter([
        { id: "cat-2", name: "بطاقات نتفلكس", image: "https://cdn.libyaplay.com/netflix-real.png", type: "cards" },
      ])
    );

    const categories = await catalogRepo.listAllCategoriesAdmin();
    const netflix = categories.find((c) => c.name === "بطاقات نتفلكس");
    expect(netflix!.image).toBe("https://cdn.libyaplay.com/netflix-real.png");
  });

  it("leaves an unrecognized category's image blank rather than guessing", async () => {
    await syncLibyaPlay(
      mockLibyaPlayAdapter([{ id: "cat-3", name: "مملكة الصحراء", image: "", type: "games" }])
    );

    const categories = await catalogRepo.listAllCategoriesAdmin();
    const category = categories.find((c) => c.name === "مملكة الصحراء");
    expect(category!.image).toBeNull();
  });
});

describe("catalog sync — discontinued Plus services drop out of the buyable catalog", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const service = (id: string, name: string): SmmService => ({
    supplierServiceId: id,
    name,
    costPer1000: 1,
    currency: "USD",
    minQuantity: 100,
    maxQuantity: 10000,
  });

  it("marks a service unavailable once Plus stops listing it, and never touches other suppliers", async () => {
    const otherSupplierCategory = await createTestCategory({ kind: "giftcard", supplier: "libya_play" });
    const untouchedProductId = await catalogRepo.upsertProduct({
      categoryId: otherSupplierCategory.id,
      kind: "giftcard",
      supplier: "libya_play",
      supplierProductRef: "untouched-giftcard",
      supplierSubCategoryRef: null,
      name: "Untouched giftcard",
      description: null,
      image: null,
      costPrice: 10,
      sellPrice: 12,
      currency: "LYD",
      pricePer1000: false,
      minQuantity: null,
      maxQuantity: null,
      available: true,
    });

    // First sync: two Plus services.
    await syncPlus(mockPlusAdapter([service("1001", "متابعين انستقرام"), service("1002", "لايكات تيك توك")]));

    // Second sync: Plus stopped listing service 1002.
    const result = await syncPlus(mockPlusAdapter([service("1001", "متابعين انستقرام")]));
    expect(result.removed).toBe(1);

    const products = await catalogRepo.listAllProductsAdmin();
    const stillListed = products.find((p) => p.supplier_product_ref === "1001");
    const discontinued = products.find((p) => p.supplier_product_ref === "1002");
    expect(stillListed!.available).toBe(true);
    expect(discontinued!.available).toBe(false);

    // The unrelated Libya Play product from a different supplier is untouched.
    const untouched = await catalogRepo.getProductById(untouchedProductId);
    expect(untouched!.available).toBe(true);
  });

  it("marks everything unavailable when a sync run legitimately returns zero services", async () => {
    // An empty `services` array is trusted as a real outcome, not treated as a failure —
    // syncPlus only reaches markStaleProductsUnavailable at all if listServices()
    // resolved without throwing, so a genuine supplier error never lands here.
    await syncPlus(mockPlusAdapter([service("2001", "test service")]));
    const result = await syncPlus(mockPlusAdapter([]));
    expect(result.removed).toBe(1);

    const products = await catalogRepo.listAllProductsAdmin();
    expect(products.find((p) => p.supplier_product_ref === "2001")!.available).toBe(false);
  });
});

describe("catalog sync — Libya Play's two product kinds (digt giftcards, social_topup live-app top-ups) share one supplier without interfering", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const socialProduct = (id: string, categoryId: string): SocialProduct => ({
    id,
    categoryId,
    name: "UP LIVE",
    image: null,
    price: 0.05,
    currency: "LYD",
    params: ["معرف المستخدم"],
    minQuantity: 100,
    maxQuantity: 150000,
    available: true,
  });

  it("syncing the social flow does not mark digt giftcard products from the same supplier stale", async () => {
    await syncLibyaPlay(mockLibyaPlayAdapter([{ id: "digt-cat-1", name: "بطاقات نتفلكس", image: "", type: "cards" }]));
    // The digt sync above uses an adapter whose listProducts always resolves to [] (see
    // mockLibyaPlayAdapter), so seed one digt product directly to have something at risk.
    const digtCategory = (await catalogRepo.listAllCategoriesAdmin()).find((c) => c.name === "بطاقات نتفلكس")!;
    const digtProductId = await catalogRepo.upsertProduct({
      categoryId: digtCategory.id,
      kind: "giftcard",
      supplier: "libya_play",
      supplierProductRef: "digt-prod-1",
      supplierSubCategoryRef: null,
      name: "Netflix Card",
      description: null,
      image: null,
      costPrice: 10,
      sellPrice: 12,
      currency: "LYD",
      pricePer1000: false,
      minQuantity: null,
      maxQuantity: null,
      available: true,
    });

    // Now sync the social flow — an entirely different set of supplier_product_refs.
    const result = await syncLibyaPlaySocial(
      mockLibyaPlaySocialAdapter(
        [{ id: "35", name: "أزال لايف", image: null }],
        { "35": [socialProduct("241", "35")] }
      )
    );
    expect(result.removed).toBe(0); // no prior social_topup products existed to go stale

    // The unrelated digt product must still be available — a kind-unaware
    // markStaleProductsUnavailable would have wrongly marked it stale here.
    const digtProduct = await catalogRepo.getProductById(digtProductId);
    expect(digtProduct!.available).toBe(true);
  });

  it("syncing the digt flow does not mark social_topup products from the same supplier stale", async () => {
    await syncLibyaPlaySocial(
      mockLibyaPlaySocialAdapter(
        [{ id: "35", name: "أزال لايف", image: null }],
        { "35": [socialProduct("241", "35")] }
      )
    );

    const result = await syncLibyaPlay(
      mockLibyaPlayAdapter([{ id: "digt-cat-2", name: "بطاقات بلايستيشن", image: "", type: "cards" }])
    );
    expect(result.removed).toBe(0);

    const socialProducts = await catalogRepo.listAllProductsAdmin();
    const upLive = socialProducts.find((p) => p.supplier_product_ref === "241");
    expect(upLive!.available).toBe(true);
    expect(upLive!.required_params).toEqual(["معرف المستخدم"]);
  });
});
