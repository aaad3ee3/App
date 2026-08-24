import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE users
      ADD COLUMN referral_code text,
      ADD COLUMN referred_by uuid REFERENCES users(id) ON DELETE SET NULL,
      -- Set the moment the referral bonus is paid out, so a user can never be rewarded
      -- twice even if the "first completed order" check races itself.
      ADD COLUMN referral_bonus_credited_at timestamptz,
      -- Throttles the re-engagement push job (jobs/reengagement-push.job.ts) so an
      -- inactive user is pinged at most once a week, not on every job tick.
      ADD COLUMN last_reengagement_push_at timestamptz
  `);
  // Partial: most rows have no code yet (backfilled lazily on first use — see
  // referral.repository.ts), and NULL != NULL means a plain unique index would allow that
  // without the WHERE clause anyway, but being explicit here documents the intent.
  await knex.raw("CREATE UNIQUE INDEX uq_users_referral_code ON users (referral_code) WHERE referral_code IS NOT NULL");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS uq_users_referral_code");
  await knex.raw(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS referral_code,
      DROP COLUMN IF EXISTS referred_by,
      DROP COLUMN IF EXISTS referral_bonus_credited_at,
      DROP COLUMN IF EXISTS last_reengagement_push_at
  `);
}
