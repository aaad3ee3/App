import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { adminLoginSchema } from "../auth/auth.schemas";
import * as authService from "../auth/auth.service";

/**
 * Registered as its own plugin (see app.ts) rather than inside admin.routes.ts, whose
 * onRequest hooks require an existing session — a login route cannot sit behind the
 * auth check it exists to satisfy.
 */
export default async function adminAuthRoutes(app: FastifyInstance) {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS } } },
    async (request, reply) => {
      const input = adminLoginSchema.parse(request.body);
      const ua = request.headers["user-agent"];
      const result = await authService.loginAdmin(input, {
        userAgent: typeof ua === "string" ? ua : null,
        ipAddress: request.ip ?? null,
      });
      reply.send(result);
    }
  );
}
