import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE binance_topups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      -- The id the customer copies out of their own Binance app and submits to us.
      -- UNIQUE is the actual security control here: it's what makes "already used"
      -- checkable atomically via a plain insert, closing the replay hole the Python
      -- reference implementation calls out explicitly (see binance-topup.service.ts).
      binance_order_id text NOT NULL,
      binance_transaction_id text,
      -- Null until the Binance API lookup resolves — the row is reserved (see
      -- binance-topup.service.ts) before the actual amount/currency are known.
      amount_usdt NUMERIC(18,8),
      currency text,
      amount_lyd NUMERIC(14,3),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'failed')),
      failure_reason text,
      wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw("CREATE UNIQUE INDEX uq_binance_topups_order_id ON binance_topups (binance_order_id)");
  await knex.raw("CREATE INDEX idx_binance_topups_user_created ON binance_topups (user_id, created_at DESC)");

  await knex.raw(`ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_reference_type_check`);
  await knex.raw(
    `ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_reference_type_check
       CHECK (reference_type IN ('topup_request', 'order', 'manual', 'binance_topup'))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_reference_type_check`);
  await knex.raw(
    `ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_reference_type_check
       CHECK (reference_type IN ('topup_request', 'order', 'manual'))`
  );
  await knex.raw("DROP TABLE IF EXISTS binance_topups");
}
