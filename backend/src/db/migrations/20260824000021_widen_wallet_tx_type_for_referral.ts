import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check`);
  await knex.raw(
    `ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
       CHECK (type IN ('topup_credit', 'order_debit', 'admin_adjustment', 'refund', 'referral_bonus'))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_type_check`);
  await knex.raw(
    `ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
       CHECK (type IN ('topup_credit', 'order_debit', 'admin_adjustment', 'refund'))`
  );
}
