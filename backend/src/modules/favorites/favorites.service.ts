import { HttpError } from "../../plugins/error-handler.plugin";
import * as catalogRepo from "../catalog/catalog.repository";
import * as repo from "./favorites.repository";

function toProductView(p: repo.FavoriteProductRow) {
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
    category: { id: p.category_id, kind: p.category_kind },
  };
}

export async function addFavorite(userId: string, productId: string): Promise<{ ok: true }> {
  const product = await catalogRepo.getProductById(productId);
  if (!product) throw new HttpError(404, "not_found", "Product not found");
  await repo.addFavorite(userId, productId);
  return { ok: true };
}

export async function removeFavorite(userId: string, productId: string): Promise<{ ok: true }> {
  await repo.removeFavorite(userId, productId);
  return { ok: true };
}

export async function listMyFavorites(userId: string) {
  const rows = await repo.listFavoriteProducts(userId);
  return { items: rows.map(toProductView) };
}

export function listMyFavoriteIds(userId: string): Promise<string[]> {
  return repo.listFavoriteProductIds(userId);
}
