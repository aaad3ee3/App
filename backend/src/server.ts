import { buildApp } from "./app";
import { env } from "./config/env";
import { startAutoCatalogSyncJob } from "./jobs/auto-catalog-sync.job";
import { startExpireTopupsJob } from "./jobs/expire-topups.job";
import { startPollSmmOrdersJob } from "./jobs/poll-smm-orders.job";
import { startPurgeSessionsJob } from "./jobs/purge-sessions.job";
import { startReengagementPushJob } from "./jobs/reengagement-push.job";
import { closeRedis } from "./lib/redis";

async function main() {
  const app = buildApp();
  const expireJobHandle = startExpireTopupsJob(5 * 60_000);
  const pollSmmJobHandle = startPollSmmOrdersJob(2 * 60_000);
  const purgeSessionsHandle = startPurgeSessionsJob(6 * 60 * 60_000);
  const reengagementHandle = startReengagementPushJob(6 * 60 * 60_000);
  const autoCatalogSyncHandle = startAutoCatalogSyncJob(6 * 60 * 60_000);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    clearInterval(expireJobHandle);
    clearInterval(pollSmmJobHandle);
    clearInterval(purgeSessionsHandle);
    clearInterval(reengagementHandle);
    clearInterval(autoCatalogSyncHandle);
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
