import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('giftcard', 'smm')),
      supplier text NOT NULL CHECK (supplier IN ('libya_play', 'plus')),
      -- Libya Play: product uuid string. Plus: numeric service_id as a string.
      supplier_product_ref text NOT NULL,
      -- Libya Play only — which sub-category this product came from (needed to re-fetch/debug).
      supplier_sub_category_ref text,
      name text NOT NULL,
      description text,
      image text,
      -- Everything normalized to LYD at sync time (Plus quotes in USD — see
      -- PLUS_USD_TO_LYD_RATE) so the orders engine never juggles currencies.
      cost_price NUMERIC(14,4) NOT NULL CHECK (cost_price >= 0),
      sell_price NUMERIC(14,4) NOT NULL CHECK (sell_price >= 0),
      currency text NOT NULL DEFAULT 'LYD',
      -- true for SMM (sell_price is a rate per 1000 units); false for giftcard (sell_price
      -- is the flat price of the product — Libya Play's digital-products pay endpoint has
      -- no quantity parameter, one purchase = one card).
      price_per_1000 boolean NOT NULL DEFAULT false,
      min_quantity int,
      max_quantity int,
      available boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (supplier, supplier_product_ref)
    )
  `);
  await knex.raw("CREATE INDEX idx_products_category ON products (category_id, available)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS products");
}
