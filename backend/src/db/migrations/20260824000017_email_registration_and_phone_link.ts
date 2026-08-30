import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Registration moved to email + password (see auth.service.ts `register`); phone
  // verification now happens separately, on demand, when a customer links a number to
  // fund top-ups. That flow reuses phone_verifications with a new purpose.
  await knex.raw(`ALTER TABLE phone_verifications DROP CONSTRAINT phone_verifications_purpose_check`);
  await knex.raw(
    `ALTER TABLE phone_verifications ADD CONSTRAINT phone_verifications_purpose_check
     CHECK (purpose IN ('register', 'reset', 'link'))`
  );

  // Registration no longer requires a phone, so email is the only thing guaranteed to
  // exist on a new account — it has to be provided and unique from here on.
  await knex.raw(`ALTER TABLE users ALTER COLUMN email SET NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);
  await knex.raw(`ALTER TABLE phone_verifications DROP CONSTRAINT phone_verifications_purpose_check`);
  await knex.raw(
    `ALTER TABLE phone_verifications ADD CONSTRAINT phone_verifications_purpose_check
     CHECK (purpose IN ('register', 'reset'))`
  );
}
