import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

/**
 * Global rate-limit plugin. Per-route overrides (login, register, webhook) are applied
 * via each route's `config.rateLimit` option — see auth.routes.ts and sms.routes.ts.
 *
 * In-memory store, fine for phase 1's single instance. Move to a Redis store
 * (@fastify/rate-limit supports a custom `redis` client option) before running more than
 * one API instance, otherwise limits are tracked per-instance instead of globally.
 */
export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
});
