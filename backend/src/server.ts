import { buildApp } from "./app";
import { env } from "./config/env";
import { startExpireTopupsJob } from "./jobs/expire-topups.job";
import { startPollSmmOrdersJob } from "./jobs/poll-smm-orders.job";
import { startPurgeSessionsJob } from "./jobs/purge-sessions.job";

async function main() {
  const app = buildApp();
  const expireJobHandle = startExpireTopupsJob(5 * 60_000);
  const pollSmmJobHandle = startPollSmmOrdersJob(2 * 60_000);
  const purgeSessionsHandle = startPurgeSessionsJob(6 * 60 * 60_000);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    clearInterval(expireJobHandle);
    clearInterval(pollSmmJobHandle);
    clearInterval(purgeSessionsHandle);
    await app.close();
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
