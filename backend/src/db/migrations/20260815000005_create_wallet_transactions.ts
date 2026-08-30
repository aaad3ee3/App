import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE wallet_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      type text NOT NULL CHECK (type IN ('topup_credit', 'order_debit', 'admin_adjustment', 'refund')),
      amount NUMERIC(14,3) NOT NULL,
      balance_after NUMERIC(14,3) NOT NULL,
      reference_type text NOT NULL CHECK (reference_type IN ('topup_request', 'order', 'manual')),
      reference_id uuid,
      idempotency_key text NOT NULL UNIQUE,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw("CREATE INDEX idx_wallet_tx_wallet_created ON wallet_transactions (wallet_id, created_at)");
  await knex.raw("CREATE INDEX idx_wallet_tx_user_created ON wallet_transactions (user_id, created_at)");

  // Append-only ledger: no UPDATE/DELETE from application code. Revoked at the DB role
  // level in production (see README) — not enforced here since the app connects as the
  // table-owning role in dev/test and migrations need DDL rights.
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS wallet_transactions");
}
