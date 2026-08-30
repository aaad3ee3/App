import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_target_type_check`);
  await knex.raw(
    `ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
       CHECK (target_type IN ('sms_event', 'topup_request', 'wallet', 'order', 'product'))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_target_type_check`);
  await knex.raw(
    `ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
       CHECK (target_type IN ('sms_event', 'topup_request', 'wallet'))`
  );
}
