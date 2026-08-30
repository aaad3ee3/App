import type { Knex } from "knex";

/**
 * Orders only ever stored unit_price/total_price — what the customer paid — never what it
 * actually cost us to fulfill (products.cost_price). That's fine for the order itself, but
 * makes profit unanswerable: cost_price and the markup percent can both change over time,
 * so computing "profit" for a past order from *today's* cost_price would silently rewrite
 * history every time either changes. Snapshotting the cost at order time — exactly like
 * unit_price/total_price already do for the sell side — makes profit a fact recorded once,
 * not a moving target recomputed differently every time someone asks.
 *
 * Existing rows get a one-time best-effort backfill from each order's product's *current*
 * cost_price — the real historical cost at the time they were placed is gone (never
 * captured), so this is an approximation for pre-existing data only; every order from here
 * on gets an exact snapshot.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE orders
      ADD COLUMN unit_cost NUMERIC(14,4),
      ADD COLUMN total_cost NUMERIC(14,4)
  `);

  await knex.raw(`
    UPDATE orders o
    SET unit_cost = CASE WHEN o.kind = 'smm' THEN p.cost_price / 1000 ELSE p.cost_price END,
        total_cost = CASE WHEN o.kind = 'smm' THEN (p.cost_price / 1000) * o.quantity ELSE p.cost_price * o.quantity END
    FROM products p
    WHERE p.id = o.product_id AND o.unit_cost IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE orders
      DROP COLUMN IF EXISTS unit_cost,
      DROP COLUMN IF EXISTS total_cost
  `);
}
