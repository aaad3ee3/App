import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE topup_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_phone text NOT NULL,
      requested_amount NUMERIC(14,3) NOT NULL CHECK (requested_amount > 0),
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'matched', 'credited', 'expired', 'cancelled', 'manual_review')),
      matched_sms_event_id uuid,
      credited_wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(
    "CREATE INDEX idx_topups_matching ON topup_requests (status, sender_phone, requested_amount)"
  );
  await knex.raw("CREATE INDEX idx_topups_expiry ON topup_requests (status, expires_at)");
  await knex.raw("CREATE INDEX idx_topups_user_created ON topup_requests (user_id, created_at)");

  // Enforces "one active pending top-up per user" at the DB level (belt-and-braces
  // alongside the application-level check in topups.service.ts).
  await knex.raw(
    `CREATE UNIQUE INDEX uq_topups_one_pending_per_user
       ON topup_requests (user_id)
       WHERE status = 'pending'`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS topup_requests");
}
