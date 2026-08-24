import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import * as catalogRepo from "../../src/modules/catalog/catalog.repository";
import { createTestCategory, resetDb } from "../helpers";

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
describe("catalog sync — tolerates suppliers sending price fields as strings", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await db.destroy();
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
