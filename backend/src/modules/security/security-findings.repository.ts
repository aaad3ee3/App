import { db } from "../../db/knex";
import type { SecurityFindingRow, SecurityFindingSeverity } from "../../db/types";

export interface UpsertFindingInput {
  checkKey: string;
  severity: SecurityFindingSeverity;
  title: string;
  description: string;
}

/**
 * Re-running the same still-open finding every 24h would just spam the alerts feed with
 * duplicates of something the admin already knows about — the partial unique index on
 * (check_key) WHERE resolved_at IS NULL is what makes this an upsert instead of an insert:
 * an open finding for this check_key gets its description/detected_at refreshed in place,
 * a resolved (or nonexistent) one gets a brand-new row.
 */
export async function upsertOpenFinding(input: UpsertFindingInput): Promise<void> {
  await db.raw(
    `INSERT INTO security_findings (check_key, severity, title, description)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (check_key) WHERE resolved_at IS NULL
     DO UPDATE SET severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description, detected_at = now()`,
    [input.checkKey, input.severity, input.title, input.description]
  );
}

/**
 * Auto-heals per-instance findings (one row per stale order, per over-cap user, ...): a
 * check that no longer detects an instance it previously flagged means that instance got
 * fixed (the order was resolved, the session count dropped back under the cap, ...) —
 * closing it automatically is what keeps the alerts feed showing what's *currently* wrong
 * instead of accumulating every issue that was ever true for a moment. `resolved_by` stays
 * null for these — distinguishable from an admin's own resolve action, which always
 * records a real user id.
 */
export async function autoResolveStaleFindings(checkKeyPrefix: string, stillActiveCheckKeys: string[]): Promise<void> {
  const query = db<SecurityFindingRow>("security_findings")
    .where("check_key", "like", `${checkKeyPrefix}:%`)
    .whereNull("resolved_at");
  if (stillActiveCheckKeys.length > 0) {
    query.whereNotIn("check_key", stillActiveCheckKeys);
  }
  await query.update({ resolved_at: new Date() });
}

export function listOpenFindings(): Promise<SecurityFindingRow[]> {
  return db<SecurityFindingRow>("security_findings").whereNull("resolved_at").orderBy("detected_at", "desc");
}

export async function resolveFinding(id: string, adminUserId: string): Promise<SecurityFindingRow | undefined> {
  const [row] = await db<SecurityFindingRow>("security_findings")
    .where({ id })
    .whereNull("resolved_at")
    .update({ resolved_at: new Date(), resolved_by: adminUserId })
    .returning("*");
  return row;
}
