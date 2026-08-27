import type { Knex } from "knex";

/**
 * Lets a customer request a top-up without declaring an exact amount up front — they
 * link their phone once, then transfer whatever they like and it's credited as-is. See
 * sms.repository.ts `findMatchCandidates`: a NULL requested_amount matches any amount
 * from that phone, instead of requiring it within tolerance of a declared figure.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE topup_requests ALTER COLUMN requested_amount DROP NOT NULL`);
  await knex.raw(`ALTER TABLE topup_requests DROP CONSTRAINT topup_requests_requested_amount_check`);
  await knex.raw(
    `ALTER TABLE topup_requests ADD CONSTRAINT topup_requests_requested_amount_check
       CHECK (requested_amount IS NULL OR requested_amount > 0)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE topup_requests DROP CONSTRAINT topup_requests_requested_amount_check`);
  await knex.raw(
    `ALTER TABLE topup_requests ADD CONSTRAINT topup_requests_requested_amount_check
       CHECK (requested_amount > 0)`
  );
  await knex.raw(`ALTER TABLE topup_requests ALTER COLUMN requested_amount SET NOT NULL`);
}
