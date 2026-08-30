import { db } from "../../db/knex";
import type { FavoriteRow, ProductRow } from "../../db/types";

export async function addFavorite(userId: string, productId: string): Promise<void> {
  // ON CONFLICT DO NOTHING: starring an already-starred product is a no-op, not an error —
  // the mobile star button has no "already favorited" state to distinguish.
  await db.raw(
    `INSERT INTO favorites (user_id, product_id) VALUES (?, ?)
     ON CONFLICT (user_id, product_id) DO NOTHING`,
    [userId, productId]
  );
}

export function removeFavorite(userId: string, productId: string): Promise<number> {
  return db<FavoriteRow>("favorites").where({ user_id: userId, product_id: productId }).del();
}

export function listFavoriteProductIds(userId: string): Promise<string[]> {
  return db<FavoriteRow>("favorites")
    .where({ user_id: userId })
    .pluck("product_id");
}

/** Joined with products (and their category) so the mobile app can render the list directly. */
export interface FavoriteProductRow extends ProductRow {
  category_kind: "giftcard" | "smm";
}

export function listFavoriteProducts(userId: string): Promise<FavoriteProductRow[]> {
  return db<FavoriteRow>("favorites as f")
    .join("products as p", "p.id", "f.product_id")
    .join("categories as c", "c.id", "p.category_id")
    .where("f.user_id", userId)
    .orderBy("f.created_at", "desc")
    .select("p.*", "c.kind as category_kind") as unknown as Promise<FavoriteProductRow[]>;
}
