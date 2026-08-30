import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE device_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL,
      platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // A device token is issued by FCM per app install, so it identifies a device, not a
  // user. Unique on the token alone: when someone signs in on a phone that previously
  // belonged to another account, the row must MOVE to the new user rather than
  // duplicate — otherwise the previous owner keeps receiving that phone's notifications.
  await knex.raw("CREATE UNIQUE INDEX uq_device_tokens_token ON device_tokens (token)");
  await knex.raw("CREATE INDEX idx_device_tokens_user ON device_tokens (user_id)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS device_tokens");
}
