import Redis from "ioredis";
import { env } from "../config/env";

/**
 * Shared Redis connection, created only when REDIS_URL is configured.
 *
 * Redis is optional by design: a single API instance is correctly served by the
 * in-memory rate-limit store, and requiring Redis for a one-box deployment would add a
 * failure mode for no benefit. It becomes necessary the moment a second instance exists,
 * because otherwise each process counts requests separately and the effective limit
 * silently multiplies by the number of instances.
 */
let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    // @fastify/rate-limit requires this: it pipelines commands and expects the client to
    // surface errors rather than queue forever while Redis is unreachable.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    // Back off rather than reconnecting in a tight loop if Redis goes away.
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });

  client.on("error", (err) => {
    // Do not throw: a Redis outage must not take the API down with it. The rate limiter
    // is configured to fail open (see rate-limit.plugin.ts), so requests keep flowing
    // and this line is the operator's signal to go look.
    // eslint-disable-next-line no-console
    console.error("[redis] connection error:", err.message);
  });

  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = null;
}
