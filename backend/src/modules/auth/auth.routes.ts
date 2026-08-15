import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { HttpError } from "../../plugins/error-handler.plugin";
import { findUserById } from "./auth.repository";
import { loginSchema, registerSchema } from "./auth.schemas";
import * as authService from "./auth.service";

function sessionMeta(request: { headers: Record<string, unknown>; ip: string }) {
  const ua = request.headers["user-agent"];
  return {
    userAgent: typeof ua === "string" ? ua : null,
    ipAddress: request.ip ?? null,
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    "/register",
    { config: { rateLimit: { max: env.RATE_LIMIT_REGISTER_MAX, timeWindow: env.RATE_LIMIT_REGISTER_WINDOW_MS } } },
    async (request, reply) => {
      const input = registerSchema.parse(request.body);
      const result = await authService.register(input, sessionMeta(request));
      reply.status(201).send(result);
    }
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS } } },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const result = await authService.login(input, sessionMeta(request));
      reply.send(result);
    }
  );

  app.post("/logout", { preHandler: app.authenticate }, async (request, reply) => {
    const authorization = request.headers.authorization ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (token) await authService.logout(token);
    reply.send({ ok: true });
  });

  app.post("/logout-all", { preHandler: app.authenticate }, async (request, reply) => {
    const result = await authService.logoutEverywhere(request.user!.id);
    reply.send(result);
  });

  app.get("/me", { preHandler: app.authenticate }, async (request) => {
    const user = await findUserById(request.user!.id);
    if (!user) throw new HttpError(404, "not_found", "User not found");
    return { id: user.id, email: user.email, full_name: user.full_name, is_admin: user.is_admin };
  });
}
