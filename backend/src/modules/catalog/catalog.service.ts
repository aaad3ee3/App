import { HttpError } from "../../plugins/error-handler.plugin";
import type { ProductKind } from "../../db/types";
import * as repo from "./catalog.repository";

export async function listCategories(kind?: ProductKind) {
  const rows = await repo.listEnabledCategories(kind);
  return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, image: r.image }));
}

export async function listProducts(categoryId: string) {
  const category = await repo.getCategoryById(categoryId);
  if (!category || !category.enabled) {
    throw new HttpError(404, "not_found", "Category not found");
  }

  const products = await repo.listAvailableProductsByCategory(categoryId);
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    image: p.image,
    price: p.sell_price,
    currency: p.currency,
    price_per_1000: p.price_per_1000,
    min_quantity: p.min_quantity,
    max_quantity: p.max_quantity,
  }));
}
