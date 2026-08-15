import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { CategoryRow, ProductKind, ProductRow, Supplier } from "../../db/types";

export interface UpsertCategoryInput {
  kind: ProductKind;
  supplier: Supplier;
  supplierCategoryRef: string | null;
  name: string;
  image: string | null;
}

/**
 * Dedupe key is (supplier, supplier_category_ref) for Libya Play, (supplier, name) for
 * Plus's synthetic platform categories (supplier_category_ref is null there) — see the
 * expression unique index in the categories migration. Deliberately does NOT touch
 * `enabled`/`sort_order` on conflict so admin overrides survive repeated syncs.
 */
export async function upsertCategory(input: UpsertCategoryInput): Promise<string> {
  const result = await db.raw<{ rows: { id: string }[] }>(
    `INSERT INTO categories (kind, supplier, supplier_category_ref, name, image)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT ON CONSTRAINT uq_categories_supplier_ref
     DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, updated_at = now()
     RETURNING id`,
    [input.kind, input.supplier, input.supplierCategoryRef, input.name, input.image]
  );
  return result.rows[0]!.id;
}

export interface UpsertProductInput {
  categoryId: string;
  kind: ProductKind;
  supplier: Supplier;
  supplierProductRef: string;
  supplierSubCategoryRef: string | null;
  name: string;
  description: string | null;
  image: string | null;
  costPrice: number;
  sellPrice: number;
  currency: string;
  pricePer1000: boolean;
  minQuantity: number | null;
  maxQuantity: number | null;
  available: boolean;
}

/**
 * Dedupe key is (supplier, supplier_product_ref) — a plain unique constraint, unlike
 * categories. NOTE: sell_price is always recomputed and overwritten on every sync (cost *
 * markup) — a manual admin price override does NOT currently survive a re-sync. Revisit
 * with a `sell_price_overridden` flag if that turns out to matter in practice.
 */
export async function upsertProduct(input: UpsertProductInput): Promise<string> {
  const row = {
    category_id: input.categoryId,
    kind: input.kind,
    supplier: input.supplier,
    supplier_product_ref: input.supplierProductRef,
    supplier_sub_category_ref: input.supplierSubCategoryRef,
    name: input.name,
    description: input.description,
    image: input.image,
    cost_price: input.costPrice.toFixed(4),
    sell_price: input.sellPrice.toFixed(4),
    currency: input.currency,
    price_per_1000: input.pricePer1000,
    min_quantity: input.minQuantity,
    max_quantity: input.maxQuantity,
    available: input.available,
  };

  const rows = await db<ProductRow>("products")
    .insert(row)
    .onConflict(["supplier", "supplier_product_ref"])
    .merge({ ...row, updated_at: new Date() })
    .returning("id");
  return rows[0]!.id;
}

export function listEnabledCategories(kind?: ProductKind): Promise<CategoryRow[]> {
  const query = db<CategoryRow>("categories").where({ enabled: true });
  if (kind) query.andWhere({ kind });
  return query.orderBy([{ column: "sort_order" }, { column: "name" }]);
}

export function getCategoryById(id: string, trx: Knex | Knex.Transaction = db): Promise<CategoryRow | undefined> {
  return trx<CategoryRow>("categories").where({ id }).first();
}

export function listAvailableProductsByCategory(categoryId: string): Promise<ProductRow[]> {
  return db<ProductRow>("products")
    .where({ category_id: categoryId, available: true })
    .orderBy("sell_price", "asc");
}

export function getProductById(id: string, trx: Knex | Knex.Transaction = db): Promise<ProductRow | undefined> {
  return trx<ProductRow>("products").where({ id }).first();
}

export async function listAllCategoriesAdmin(): Promise<CategoryRow[]> {
  return db<CategoryRow>("categories").orderBy([{ column: "kind" }, { column: "sort_order" }, { column: "name" }]);
}

export async function listAllProductsAdmin(categoryId?: string): Promise<ProductRow[]> {
  const query = db<ProductRow>("products");
  if (categoryId) query.where({ category_id: categoryId });
  return query.orderBy("name");
}

export function setCategoryEnabled(id: string, enabled: boolean): Promise<number> {
  return db("categories").where({ id }).update({ enabled, updated_at: new Date() });
}

export function updateProductOverride(
  id: string,
  fields: { sellPrice?: number; available?: boolean }
): Promise<number> {
  const update: Record<string, unknown> = { updated_at: new Date() };
  if (fields.sellPrice !== undefined) update.sell_price = fields.sellPrice.toFixed(4);
  if (fields.available !== undefined) update.available = fields.available;
  return db("products").where({ id }).update(update);
}
