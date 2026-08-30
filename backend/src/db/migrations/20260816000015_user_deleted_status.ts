import type { Knex } from "knex";

/**
 * Adds a 'deleted' user status.
 *
 * Account deletion cannot be a row delete: `orders.user_id` and
 * `wallet_transactions.user_id` are ON DELETE RESTRICT on purpose, because the wallet
 * ledger is the financial record of real money movements and must survive. Deleting the
 * row would either fail outright or, if the constraints were loosened, destroy the only
 * evidence of what a customer paid and received.
 *
 * So deletion anonymizes instead: personal data is cleared, the account is marked
 * 'deleted' and can never be signed into again, while the ledger keeps referring to an
 * account with no identity attached. That satisfies the app stores' deletion requirement
 * — personal data is removed — without falsifying the books.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`);
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'deleted'))`);
  await knex.raw(`ALTER TABLE users ADD COLUMN deleted_at timestamptz`);
}

export async function down(knex: Knex): Promise<void> {
  // Any anonymized accounts must go back to 'disabled', or the narrowed constraint fails.
  await knex.raw(`UPDATE users SET status = 'disabled' WHERE status = 'deleted'`);
  await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`);
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'))`);
  await knex.raw(`ALTER TABLE users DROP COLUMN IF EXISTS deleted_at`);
}
