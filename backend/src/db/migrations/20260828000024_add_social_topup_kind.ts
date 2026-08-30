import type { Knex } from "knex";

/**
 * Adds the 'social_topup' product/order kind — Libya Play's `/social/*` flow (live-app
 * top-ups: Azal Live, Party Star, imo, ...). A customer supplies a platform user id rather
 * than receiving a redeemable code, and Libya Play credits it asynchronously — see
 * poll-social-orders.job.ts. Two new nullable columns carry what that flow needs and the
 * existing two kinds never populate: the set of field labels a product requires from the
 * customer (`products.required_params`, e.g. `["معرف المستخدم"]`) and the values they
 * actually typed (`orders.social_params`).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE categories DROP CONSTRAINT categories_kind_check`);
  await knex.raw(`ALTER TABLE categories ADD CONSTRAINT categories_kind_check CHECK (kind IN ('giftcard', 'smm', 'social_topup'))`);
  await knex.raw(`ALTER TABLE products DROP CONSTRAINT products_kind_check`);
  await knex.raw(`ALTER TABLE products ADD CONSTRAINT products_kind_check CHECK (kind IN ('giftcard', 'smm', 'social_topup'))`);
  await knex.raw(`ALTER TABLE orders DROP CONSTRAINT orders_kind_check`);
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_kind_check CHECK (kind IN ('giftcard', 'smm', 'social_topup'))`);

  await knex.raw(`ALTER TABLE products ADD COLUMN required_params jsonb`);
  await knex.raw(`ALTER TABLE orders ADD COLUMN social_params jsonb`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE orders DROP COLUMN social_params`);
  await knex.raw(`ALTER TABLE products DROP COLUMN required_params`);

  await knex.raw(`ALTER TABLE orders DROP CONSTRAINT orders_kind_check`);
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_kind_check CHECK (kind IN ('giftcard', 'smm'))`);
  await knex.raw(`ALTER TABLE products DROP CONSTRAINT products_kind_check`);
  await knex.raw(`ALTER TABLE products ADD CONSTRAINT products_kind_check CHECK (kind IN ('giftcard', 'smm'))`);
  await knex.raw(`ALTER TABLE categories DROP CONSTRAINT categories_kind_check`);
  await knex.raw(`ALTER TABLE categories ADD CONSTRAINT categories_kind_check CHECK (kind IN ('giftcard', 'smm'))`);
}
