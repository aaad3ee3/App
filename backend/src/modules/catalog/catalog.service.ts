import { HttpError } from "../../plugins/error-handler.plugin";
import { normalizeSearchText, tokenizeQuery } from "../../lib/search";
import type { ProductKind, ProductRow } from "../../db/types";
import * as repo from "./catalog.repository";

function toProductView(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    image: p.image,
    price: p.sell_price,
    currency: p.currency,
    price_per_1000: p.price_per_1000,
    min_quantity: p.min_quantity,
    max_quantity: p.max_quantity,
  };
}

export async function listCategories(kind?: ProductKind) {
  const rows = await repo.listEnabledCategories(kind);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    image: r.image,
    product_count: r.product_count,
  }));
}

export async function listProducts(categoryId: string) {
  const category = await repo.getCategoryById(categoryId);
  if (!category || !category.enabled) {
    throw new HttpError(404, "not_found", "هذا التصنيف لم يعد متاحاً.");
  }

  const products = await repo.listAvailableProductsByCategory(categoryId);
  return products.map(toProductView);
}

/**
 * Searches the whole catalog at once, so a customer never has to guess which category a
 * product lives in.
 *
 * Each result carries its category, because the app needs it to decide which purchase
 * screen to open — a gift card and an SMM service are bought in completely different ways.
 */
export async function searchCatalog(rawQuery: string, kind: ProductKind | undefined, limit: number) {
  const termGroups = tokenizeQuery(rawQuery);
  // A query of nothing but spaces would otherwise match everything, turning search into
  // "dump the catalog".
  if (termGroups.length === 0) return [];

  const rows = await repo.searchProducts({
    termGroups,
    normalizedQuery: normalizeSearchText(rawQuery.trim()),
    kind,
    limit,
  });

  return rows.map((row) => ({
    ...toProductView(row),
    category: { id: row.category_id, name: row.category_name, kind: row.category_kind },
  }));
}
