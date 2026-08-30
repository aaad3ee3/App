import { runSecurityScan } from "../modules/security/security-scan.service";

/** Runs the periodic integrity scan (see security-scan.service.ts) on an interval — never
 *  allowed to crash the process a request could be in the middle of. */
export function startSecurityScanJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    runSecurityScan().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[security-scan.job] scan failed:", err instanceof Error ? err.message : err);
    });
  }, intervalMs);
}
