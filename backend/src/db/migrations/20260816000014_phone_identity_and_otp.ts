import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Phone becomes the primary identity: it is what customers know themselves by here,
  // it is the channel that can actually reach them, and it is the only one that can
  // fund a wallet. Email drops to optional — many customers do not use one at all.
  await knex.raw(`ALTER TABLE users ADD COLUMN phone text`);
  await knex.raw(`ALTER TABLE users ADD COLUMN phone_verified_at timestamptz`);

  // Existing rows (development and test data only — this ships before launch) have no
  // phone. Leave them null rather than inventing one; they can still sign in by email
  // until they add a number.
  await knex.raw(`CREATE UNIQUE INDEX uq_users_phone ON users (phone) WHERE phone IS NOT NULL`);

  // Email was NOT NULL UNIQUE. Keep uniqueness, drop the requirement.
  await knex.raw(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);

  await knex.raw(`
    CREATE TABLE phone_verifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone text NOT NULL,
      -- Hashed, never stored in the clear: a database leak must not hand an attacker a
      -- live password-reset code, exactly as with session tokens.
      code_hash text NOT NULL,
      purpose text NOT NULL CHECK (purpose IN ('register', 'reset')),
      attempts integer NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Lookup is always "the newest live code for this phone and purpose".
  await knex.raw(
    "CREATE INDEX idx_phone_verifications_lookup ON phone_verifications (phone, purpose, created_at DESC)"
  );
  // Supports the per-phone request-rate check.
  await knex.raw("CREATE INDEX idx_phone_verifications_recent ON phone_verifications (phone, created_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS phone_verifications");
  await knex.raw("DROP INDEX IF EXISTS uq_users_phone");
  await knex.raw("ALTER TABLE users DROP COLUMN IF EXISTS phone_verified_at");
  await knex.raw("ALTER TABLE users DROP COLUMN IF EXISTS phone");
  // Restoring NOT NULL would fail if any row has a null email, so leave it nullable.
}
