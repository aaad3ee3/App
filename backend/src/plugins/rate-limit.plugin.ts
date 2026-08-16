import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { sha256Hex } from "../lib/crypto";
import { getRedis } from "../lib/redis";

/**
 * Global rate-limit plugin. Per-route overrides (login, register, webhook, orders,
 * top-ups, admin writes) are applied via each route's `config.rateLimit`.
 *
 * IP-keyed limits are only trustworthy when `trustProxy` matches the real number of
 * proxies in front of the process — see TRUST_PROXY_HOPS in config/env.ts. Without it
 * every client behind nginx looks like 127.0.0.1 and shares one bucket.
 *
 * The limiter runs at `preHandler` rather than the library default of `onRequest` so
 * that `keyByUser` below can see `request.user`, which the auth hook populates during
 * `onRequest`. Body parsing therefore happens before the limit check, which is safe
 * because `bodyLimit` (config/env.ts MAX_BODY_BYTES) caps bodies at 64 KB.
 *
 * Counts live in Redis when REDIS_URL is set, and in process memory otherwise. The
 * in-memory store is correct for exactly one instance; with two or more, each process
 * keeps its own tally and the effective limit silently multiplies by the instance count.
 */
export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  const redis = getRedis();

  if (redis) {
    app.log.info("rate limiting backed by Redis (shared across instances)");
  } else {
    app.log.info("rate limiting held in process memory (single-instance only)");
  }

  await app.register(rateLimit, {
    global: true,
    hook: "preHandler",
    max: env.RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW_MS,
    redis: redis ?? undefined,
    // Namespaced so a Redis instance shared with anything else cannot collide with, or
    // be wiped by, another application's keys.
    nameSpace: "sayeh-rl:",
    // Fail open if Redis is unreachable. The alternative — rejecting every request when
    // the limiter's backing store is down — turns a Redis blip into a full outage, which
    // is a worse failure than briefly unmetered traffic that the app can still handle.
    skipOnError: true,
    // Fastify's default handler returns the library's own message shape; route everything
    // through our error envelope instead so clients only ever parse one error format.
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: {
        code: "rate_limited",
        message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
      },
    }),
  });
});

/**
 * Keys a rate limit by authenticated caller instead of by IP.
 *
 * Money-moving endpoints need this: several customers legitimately share one
 * mobile-carrier NAT address (so a pure IP limit would punish innocent users), while a
 * single logged-in account must not be able to machine-gun orders at the supplier.
 *
 * Degrades safely — if the auth hook hasn't run yet the bearer token still identifies
 * the session, and an unauthenticated request falls back to its IP. It never returns a
 * constant, which would merge every caller into one bucket.
 */
export function keyByUser(request: FastifyRequest): string {
  if (request.user?.id) return `user:${request.user.id}`;

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    // Hash rather than key on the raw token so the limiter's in-memory map never holds
    // credentials that could be read out of a heap dump.
    if (token) return `session:${sha256Hex(token)}`;
  }

  return `ip:${request.ip}`;
}
