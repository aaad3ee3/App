import { buildApp } from "./app";
import { env } from "./config/env";
import { startAutoCatalogSyncJob } from "./jobs/auto-catalog-sync.job";
import { startExpireTopupsJob } from "./jobs/expire-topups.job";
import { startPollSmmOrdersJob } from "./jobs/poll-smm-orders.job";
import { startPollSocialOrdersJob } from "./jobs/poll-social-orders.job";
import { startPurgeSessionsJob } from "./jobs/purge-sessions.job";
import { startReengagementPushJob } from "./jobs/reengagement-push.job";
import { startSecurityScanJob } from "./jobs/security-scan.job";
import { runSecurityScan } from "./modules/security/security-scan.service";
import { closeRedis } from "./lib/redis";

async function main() {
  const app = buildApp();
  const expireJobHandle = startExpireTopupsJob(5 * 60_000);
  const pollSmmJobHandle = startPollSmmOrdersJob(2 * 60_000);
  const pollSocialJobHandle = startPollSocialOrdersJob(2 * 60_000);
  const purgeSessionsHandle = startPurgeSessionsJob(6 * 60 * 60_000);
  const reengagementHandle = startReengagementPushJob(6 * 60 * 60_000);
  const autoCatalogSyncHandle = startAutoCatalogSyncJob(6 * 60 * 60_000);
  const securityScanHandle = startSecurityScanJob(24 * 60 * 60_000);
  // Runs once immediately at boot too — otherwise the alerts feed stays empty for up to a
  // full day after every deploy instead of reflecting the current state right away.
  void runSecurityScan().catch((err) => {
    app.log.error({ err }, "initial security scan failed");
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    clearInterval(expireJobHandle);
    clearInterval(pollSmmJobHandle);
    clearInterval(pollSocialJobHandle);
    clearInterval(purgeSessionsHandle);
    clearInterval(reengagementHandle);
    clearInterval(autoCatalogSyncHandle);
    clearInterval(securityScanHandle);
    await app.close();
    await closeRedis();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
