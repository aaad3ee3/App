import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE sms_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      delivery_dedupe_key text NOT NULL UNIQUE,
      raw_payload jsonb NOT NULL,
      raw_text text NOT NULL,
      reported_sender text,
      sender_trusted boolean NOT NULL,
      parsed_ok boolean NOT NULL DEFAULT false,
      parsed_amount NUMERIC(14,3),
      parsed_sender_phone text,
      match_status text NOT NULL DEFAULT 'unmatched'
        CHECK (match_status IN (
          'unmatched', 'matched', 'ambiguous',
          'ignored_untrusted_sender', 'ignored_no_match', 'manually_resolved'
        )),
      matched_topup_request_id uuid REFERENCES topup_requests(id) ON DELETE SET NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz,
      resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
      resolution_note text
    )
  `);
  await knex.raw("CREATE INDEX idx_sms_events_triage ON sms_events (match_status, received_at)");
  await knex.raw(
    "CREATE INDEX idx_sms_events_phone_amount ON sms_events (parsed_sender_phone, parsed_amount)"
  );

  await knex.raw(
    "ALTER TABLE topup_requests ADD CONSTRAINT fk_topups_matched_sms_event " +
      "FOREIGN KEY (matched_sms_event_id) REFERENCES sms_events(id) ON DELETE SET NULL"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE topup_requests DROP CONSTRAINT IF EXISTS fk_topups_matched_sms_event");
  await knex.raw("DROP TABLE IF EXISTS sms_events");
}
