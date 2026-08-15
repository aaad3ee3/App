import { db } from "../db/knex";
import { TOPUP_STATUS } from "../config/constants";

/**
 * Sweeps `pending` top-up requests past their `expires_at` to `expired`, keeping the
 * matching candidate pool (sms.repository.ts's `findMatchCandidates`) small. An SMS that
 * arrives after this runs naturally yields zero candidates and routes to admin, who can
 * still credit an expired request manually — see admin.service.ts `creditTopupManually`.
 */
export async function sweepExpiredTopups(): Promise<number> {
  return db("topup_requests")
    .where({ status: TOPUP_STATUS.PENDING })
    .andWhere("expires_at", "<=", new Date())
    .update({ status: TOPUP_STATUS.EXPIRED, updated_at: new Date() });
}

export function startExpireTopupsJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    sweepExpiredTopups().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[expire-topups.job] sweep failed:", err);
    });
  }, intervalMs);
}
