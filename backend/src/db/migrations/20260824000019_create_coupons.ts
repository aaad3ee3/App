import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE coupons (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL,
      discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
      -- For 'percent' this is 1-100 (validated in the service layer, where the type is
      -- known); for 'fixed' it's a plain LYD amount. One column serves both to avoid two
      -- near-identical nullable columns.
      discount_value NUMERIC(10,3) NOT NULL CHECK (discount_value > 0),
      min_order_amount NUMERIC(10,3) NOT NULL DEFAULT 0,
      -- NULL means unlimited total redemptions.
      max_uses int,
      used_count int NOT NULL DEFAULT 0,
      max_uses_per_user int NOT NULL DEFAULT 1,
      enabled boolean NOT NULL DEFAULT true,
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Case-insensitive: a customer typing "sayeh10" should redeem the same coupon as "SAYEH10".
  await knex.raw("CREATE UNIQUE INDEX uq_coupons_code ON coupons (upper(code))");

  await knex.raw(`
    CREATE TABLE coupon_redemptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      discount_amount NUMERIC(14,4) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // One redemption per order — an order is created once, so it can carry at most one coupon.
  await knex.raw("CREATE UNIQUE INDEX uq_coupon_redemptions_order ON coupon_redemptions (order_id)");
  // Backs the per-user usage-limit check (max_uses_per_user).
  await knex.raw("CREATE INDEX idx_coupon_redemptions_coupon_user ON coupon_redemptions (coupon_id, user_id)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS coupon_redemptions");
  await knex.raw("DROP TABLE IF EXISTS coupons");
}
