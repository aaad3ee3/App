import { purgeDeadSessions } from "../modules/auth/auth.repository";

/**
 * Grace period before a dead (expired or revoked) session row is deleted. Keeping them
 * briefly leaves a trail for "why was I signed out?" support questions; keeping them
 * forever just grows the table and leaves token hashes on disk with nothing to protect.
 */
const RETAIN_DEAD_SESSIONS_DAYS = 7;

export async function purgeSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - RETAIN_DEAD_SESSIONS_DAYS * 24 * 60 * 60 * 1000);
  return purgeDeadSessions(cutoff);
}

export function startPurgeSessionsJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    purgeSessions().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[purge-sessions.job] purge failed:", err);
    });
  }, intervalMs);
}
