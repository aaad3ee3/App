import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env";
import { applyMarkup } from "../../src/modules/catalog/catalog-sync.service";

describe("applyMarkup", () => {
  const markup = 1 + env.CATALOG_MARKUP_PERCENT;

  it("never sells below the configured margin", () => {
    // Rounding is upward for exactly this reason: a downward round would quietly hand
    // back part of the margin on every single item in the catalog.
    for (const cost of [0.01, 1, 7.7418, 12.5, 99.999, 1234.5678]) {
      expect(applyMarkup(cost), `cost ${cost}`).toBeGreaterThanOrEqual(cost * markup);
    }
  });

  it("gives back at most two decimals, so the shelf price is the charged price", () => {
    for (const cost of [7.7418, 0.8342, 41.6667]) {
      const price = applyMarkup(cost);
      expect(Number(price.toFixed(2)), `cost ${cost}`).toBe(price);
    }
  });

  it("stays within a dirham of the exact marked-up price", () => {
    for (const cost of [7.7418, 0.8342, 41.6667, 300]) {
      expect(applyMarkup(cost) - cost * markup).toBeLessThan(0.01);
    }
  });

  it("keeps a free product free", () => {
    expect(applyMarkup(0)).toBe(0);
  });
});
