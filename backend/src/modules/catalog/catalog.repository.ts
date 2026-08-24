import type { Knex } from "knex";
import { db } from "../../db/knex";
import { sanitizeImageUrl, sanitizeName, sanitizeText } from "../../lib/sanitize";
import { escapeLikePattern } from "../../lib/search";
import type { CategoryRow, ProductKind, ProductRow, Supplier } from "../../db/types";

/**
 * The indexed expressions from the catalog-search migration. Written exactly as the index
 * defines them — any difference, even whitespace inside the call, and Postgres stops
 * recognising the expression as indexable and falls back to a sequential scan.
 */
const NORMALIZED = "sayeh_search_normalize(p.name)";
const NORMALIZED_CATEGORY = "sayeh_search_normalize(c.name)";

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
 *
 * `image` is COALESCEd rather than overwritten outright: most suppliers only provide an
 * image for a handful of categories, so an admin filling the rest in by hand (see
 * updateCategoryImage) needs that to stick across every future sync, not get wiped the
 * next time the button is pressed. A category with no image yet — admin or supplier —
 * still picks up the supplier's image the moment one becomes available.
 *
 * Name and image are sanitized here rather than at the call site: this function and
 * upsertProduct are the only ways supplier data enters the catalog tables, so cleaning
 * them here means no future sync path can accidentally skip it.
 */
export async function upsertCategory(input: UpsertCategoryInput): Promise<string> {
  const result = await db.raw<{ rows: { id: string }[] }>(
    `INSERT INTO categories (kind, supplier, supplier_category_ref, name, image)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (supplier, COALESCE(supplier_category_ref, name))
     DO UPDATE SET name = EXCLUDED.name, image = COALESCE(categories.image, EXCLUDED.image), updated_at = now()
     RETURNING id`,
    [
      input.kind,
      input.supplier,
      input.supplierCategoryRef,
      sanitizeName(input.name, "تصنيف", 200),
      sanitizeImageUrl(input.image),
    ]
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
    // Sanitized here for the same reason as upsertCategory above — single choke point.
    name: sanitizeName(input.name, input.supplierProductRef, 300),
    description: sanitizeText(input.description, 1000),
    image: sanitizeImageUrl(input.image),
    // Number(...) here for the same reason name/image are sanitized here: this is the
    // single choke point all supplier data passes through, and at least one supplier is
    // confirmed to send price fields as numeric strings despite its documented type —
    // .toFixed() throws on a string, so trusting the declared TS type isn't enough.
    cost_price: Number(input.costPrice).toFixed(4),
    sell_price: Number(input.sellPrice).toFixed(4),
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

export interface ProductSearchRow extends ProductRow {
  category_name: string;
  category_kind: ProductKind;
}

export interface SearchProductsInput {
  /**
   * One entry per word the customer typed, each holding that word and its aliases —
   * already normalized and LIKE-escaped by tokenizeQuery. Groups are ANDed, alternatives
   * within a group are ORed.
   */
  termGroups: string[][];
  normalizedQuery: string;
  kind?: ProductKind;
  limit: number;
}

/**
 * Full-catalog product search.
 *
 * Matches the category name as well as the product name, because that is how customers
 * actually search: a product row is called "60 UC", and nothing but its category says
 * "PUBG". Terms are ANDed (each one must appear somewhere) so that adding a word narrows
 * the result set, which is what typing more is meant to do.
 *
 * Ordering puts a product whose own name starts with the query first, then products that
 * merely contain it, then category-only matches — otherwise a cheap unrelated item wins
 * on price alone and buries the thing the customer typed.
 */
export async function searchProducts(input: SearchProductsInput): Promise<ProductSearchRow[]> {
  const query = db<ProductRow>("products as p")
    .join("categories as c", "c.id", "p.category_id")
    .where("p.available", true)
    .andWhere("c.enabled", true)
    .select("p.*", "c.name as category_name", "c.kind as category_kind");

  if (input.kind) query.andWhere("p.kind", input.kind);

  for (const group of input.termGroups) {
    query.andWhere((builder) => {
      for (const term of group) {
        builder
          .orWhereRaw(`${NORMALIZED} LIKE ? ESCAPE '\\'`, [`%${term}%`])
          .orWhereRaw(`${NORMALIZED_CATEGORY} LIKE ? ESCAPE '\\'`, [`%${term}%`]);
      }
    });
  }

  const escapedQuery = escapeLikePattern(input.normalizedQuery);
  return query
    .orderByRaw(
      `CASE
         WHEN ${NORMALIZED} LIKE ? ESCAPE '\\' THEN 0
         WHEN ${NORMALIZED} LIKE ? ESCAPE '\\' THEN 1
         WHEN ${NORMALIZED_CATEGORY} LIKE ? ESCAPE '\\' THEN 2
         ELSE 3
       END, p.sell_price ASC, p.name ASC`,
      [`${escapedQuery}%`, `%${escapedQuery}%`, `%${escapedQuery}%`]
    )
    .limit(input.limit) as unknown as Promise<ProductSearchRow[]>;
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

/**
 * Manual admin override for a category's image — most categories arrive from a supplier
 * with no image at all (Libya Play only sends real images for a handful; Plus's synthetic
 * categories never have one), so this fills the gap by hand. Sanitized the same as a
 * supplier-sourced image, and safe from being wiped by the next sync: see the COALESCE in
 * upsertCategory above. An empty string clears it back to null, which lets a future sync
 * fill it in from the supplier again.
 */
export function updateCategoryImage(id: string, image: string | null): Promise<number> {
  return db("categories").where({ id }).update({ image: sanitizeImageUrl(image), updated_at: new Date() });
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
