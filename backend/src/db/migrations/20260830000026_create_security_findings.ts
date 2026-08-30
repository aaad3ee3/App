import type { Knex } from "knex";

/**
 * Output of the periodic integrity-scan job (security-scan.job.ts) — real, checkable data
 * integrity/security signals (a negative wallet balance, a password hash that isn't
 * actually argon2, a user over the session cap, ...), not a general-purpose vulnerability
 * scanner. `check_key` is the stable identifier for *which* check produced a finding
 * (e.g. "negative_wallet_balance:<wallet_id>") — the unique index on the unresolved half
 * is what lets the job upsert instead of inserting the same still-open finding again on
 * every run.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE security_findings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      check_key text NOT NULL,
      severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
      title text NOT NULL,
      description text NOT NULL,
      detected_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      resolved_by uuid REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  // Partial unique index rather than a plain one on check_key: the same check_key must
  // stay a single open row while unresolved (so re-running the scan updates it in place),
  // but is free to recur as a brand-new row once it's been resolved and happens again.
  await knex.raw(
    "CREATE UNIQUE INDEX idx_security_findings_open_check_key ON security_findings (check_key) WHERE resolved_at IS NULL"
  );
  await knex.raw("CREATE INDEX idx_security_findings_detected ON security_findings (detected_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS security_findings");
}
