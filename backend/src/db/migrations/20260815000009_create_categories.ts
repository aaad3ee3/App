import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL CHECK (kind IN ('giftcard', 'smm')),
      supplier text NOT NULL CHECK (supplier IN ('libya_play', 'plus')),
      -- Libya Play's own top-level category id (null for Plus — its categories are our
      -- own synthetic platform groupings, see catalog-sync.service.ts).
      supplier_category_ref text,
      name text NOT NULL,
      image text,
      sort_order int NOT NULL DEFAULT 0,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw("CREATE INDEX idx_categories_kind_enabled ON categories (kind, enabled, sort_order)");
  // Prevents duplicate rows on repeated syncs — Plus categories dedupe by (supplier, name)
  // since they're synthetic, Libya Play by (supplier, supplier_category_ref).
  await knex.raw(
    `CREATE UNIQUE INDEX uq_categories_supplier_ref ON categories (supplier, COALESCE(supplier_category_ref, name))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS categories");
}
