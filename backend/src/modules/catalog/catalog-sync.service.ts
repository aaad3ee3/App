import { env } from "../../config/env";
import { PRODUCT_KIND, SUPPLIER } from "../../config/constants";
import type { GiftCardSupplierAdapter } from "../../adapters/giftcards/giftcard-supplier.interface";
import type { SmmSupplierAdapter } from "../../adapters/smm/smm-supplier.interface";
import { categorizePlusService } from "./plus-categorization";
import * as catalogRepo from "./catalog.repository";

/**
 * Applies our margin and lands on a price a shop can actually display.
 *
 * Rounded to two decimals rather than the column's four: a shelf price of "9.2902 LYD"
 * looks like a bug to a customer, and any display that tidies it up would then disagree
 * with the amount actually debited. Rounding *up* keeps the realized margin at or above
 * the configured one — never below it — at a cost of well under a dirham per item.
 */
export function applyMarkup(cost: number): number {
  return Math.ceil(cost * (1 + env.CATALOG_MARKUP_PERCENT) * 100) / 100;
}

export interface SyncResult {
  categories: number;
  products: number;
  removed: number;
}

/**
 * Walks Libya Play's real 3-level hierarchy (category -> sub-category -> product) and
 * upserts into our local catalog. Product images cascade: product's own image, falling
 * back to its sub-category's image, falling back to its top-level category's image —
 * Libya Play provides real per-category images (e.g. an actual PUBG image on the "شدات
 * ببجي" category), so this is normally just the product's own image.
 *
 * Anything Libya Play stops listing gets marked unavailable at the end (see
 * markStaleProductsUnavailable) — a discontinued product otherwise stays buyable forever,
 * since nothing else here ever revisits a product this run didn't touch.
 */
export async function syncLibyaPlay(adapter: GiftCardSupplierAdapter): Promise<SyncResult> {
  let categoryCount = 0;
  let productCount = 0;
  const seenRefs: string[] = [];

  const categories = await adapter.listCategories();
  for (const category of categories) {
    const categoryId = await catalogRepo.upsertCategory({
      kind: PRODUCT_KIND.GIFTCARD,
      supplier: SUPPLIER.LIBYA_PLAY,
      supplierCategoryRef: category.id,
      name: category.name,
      image: category.image || null,
    });
    categoryCount += 1;

    const subCategories = await adapter.listSubCategories(category.id);
    for (const subCategory of subCategories) {
      const products = await adapter.listProducts(subCategory.id);
      for (const product of products) {
        await catalogRepo.upsertProduct({
          categoryId,
          kind: PRODUCT_KIND.GIFTCARD,
          supplier: SUPPLIER.LIBYA_PLAY,
          supplierProductRef: product.id,
          supplierSubCategoryRef: subCategory.id,
          name: product.name,
          description: product.description || null,
          image: product.image || subCategory.image || category.image || null,
          costPrice: product.price,
          sellPrice: applyMarkup(product.price),
          currency: "LYD",
          pricePer1000: false,
          minQuantity: null,
          maxQuantity: null,
          available: product.available,
        });
        productCount += 1;
        seenRefs.push(product.id);
      }
    }
  }

  const removed = await catalogRepo.markStaleProductsUnavailable(SUPPLIER.LIBYA_PLAY, seenRefs);
  return { categories: categoryCount, products: productCount, removed };
}

/**
 * Plus has no category hierarchy — services are grouped into synthetic platform
 * categories via keyword heuristics (see plus-categorization.ts). Prices are quoted in
 * USD by Plus and normalized to LYD here via PLUS_USD_TO_LYD_RATE before markup, so the
 * orders engine only ever deals in LYD.
 *
 * Plus's service list changes on their end without notice — services get discontinued,
 * new ones appear. New ones need no special handling: every run re-derives categories
 * from whatever service names come back, so a brand-new service is auto-categorized and
 * upserted exactly like an existing one. A service Plus stopped listing is the opposite
 * problem — it simply won't appear in `services` below, so it's marked unavailable at the
 * end (see markStaleProductsUnavailable) rather than staying orderable forever.
 */
export async function syncPlus(adapter: SmmSupplierAdapter): Promise<SyncResult> {
  const services = await adapter.listServices();
  const categoryIdByKey = new Map<string, string>();
  let productCount = 0;
  const seenRefs: string[] = [];

  for (const service of services) {
    const match = categorizePlusService(service.name);
    let categoryId = categoryIdByKey.get(match.key);
    if (!categoryId) {
      categoryId = await catalogRepo.upsertCategory({
        kind: PRODUCT_KIND.SMM,
        supplier: SUPPLIER.PLUS,
        supplierCategoryRef: null,
        name: match.label,
        image: match.image,
      });
      categoryIdByKey.set(match.key, categoryId);
    }

    const costPriceLyd = service.costPer1000 * env.PLUS_USD_TO_LYD_RATE;
    await catalogRepo.upsertProduct({
      categoryId,
      kind: PRODUCT_KIND.SMM,
      supplier: SUPPLIER.PLUS,
      supplierProductRef: service.supplierServiceId,
      supplierSubCategoryRef: null,
      name: service.name,
      description: null,
      image: null,
      costPrice: costPriceLyd,
      sellPrice: applyMarkup(costPriceLyd),
      currency: "LYD",
      pricePer1000: true,
      minQuantity: service.minQuantity,
      maxQuantity: service.maxQuantity,
      available: true,
    });
    productCount += 1;
    seenRefs.push(service.supplierServiceId);
  }

  const removed = await catalogRepo.markStaleProductsUnavailable(SUPPLIER.PLUS, seenRefs);
  return { categories: categoryIdByKey.size, products: productCount, removed };
}
