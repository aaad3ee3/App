import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { HttpError } from "../../plugins/error-handler.plugin";
import { keyByUser } from "../../plugins/rate-limit.plugin";
import { findUserById } from "./auth.repository";
import {
  completePasswordResetSchema,
  completeRegistrationSchema,
  deleteAccountSchema,
  loginSchema,
  requestPasswordResetSchema,
  startRegistrationSchema,
} from "./auth.schemas";
import * as authService from "./auth.service";

function sessionMeta(request: { headers: Record<string, unknown>; ip: string }) {
  const ua = request.headers["user-agent"];
  return {
    userAgent: typeof ua === "string" ? ua : null,
    ipAddress: request.ip ?? null,
  };
}

/** Sending an SMS costs money and rings someone's phone, so these are tightly limited. */
const codeRequestLimit = {
  rateLimit: { max: env.RATE_LIMIT_REGISTER_MAX, timeWindow: env.RATE_LIMIT_REGISTER_WINDOW_MS },
};

export default async function authRoutes(app: FastifyInstance) {
  // --- Registration (two steps: request a code, then verify it) ---

  app.post("/register/start", { config: codeRequestLimit }, async (request, reply) => {
    const { phone } = startRegistrationSchema.parse(request.body);
    await authService.startRegistration(phone);
    // Always 202, registered or not — a different response here would reveal which
    // numbers already have accounts.
    reply.status(202).send({ ok: true });
  });

  app.post("/register/complete", { config: codeRequestLimit }, async (request, reply) => {
    const input = completeRegistrationSchema.parse(request.body);
    const result = await authService.completeRegistration(input, sessionMeta(request));
    reply.status(201).send(result);
  });

  app.post(
    "/login",
    { config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS } } },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const result = await authService.login(input, sessionMeta(request));
      reply.send(result);
    }
  );

  // --- Password reset ---

  app.post("/password-reset/request", { config: codeRequestLimit }, async (request, reply) => {
    const { phone } = requestPasswordResetSchema.parse(request.body);
    await authService.requestPasswordReset(phone);
    reply.status(202).send({ ok: true });
  });

  app.post("/password-reset/complete", { config: codeRequestLimit }, async (request, reply) => {
    const input = completePasswordResetSchema.parse(request.body);
    await authService.completePasswordReset(input);
    // Deliberately no session returned: after a reset the user signs in again, which
    // confirms the new password works before they rely on it.
    reply.send({ ok: true });
  });

  // --- Session management ---

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
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
    };
  });

  // --- Account deletion (required by both app stores) ---

  app.post(
    "/delete-account",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: 60_000, keyGenerator: keyByUser } },
    },
    async (request, reply) => {
      const { password } = deleteAccountSchema.parse(request.body);
      const result = await authService.deleteAccount(request.user!.id, password);
      reply.send(result);
    }
  );
}
