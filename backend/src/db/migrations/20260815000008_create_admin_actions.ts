import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE admin_actions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action text NOT NULL,
      target_type text NOT NULL CHECK (target_type IN ('sms_event', 'topup_request', 'wallet')),
      target_id uuid NOT NULL,
      details jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw("CREATE INDEX idx_admin_actions_target ON admin_actions (target_type, target_id)");
  await knex.raw("CREATE INDEX idx_admin_actions_admin_created ON admin_actions (admin_user_id, created_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS admin_actions");
}
