import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { HttpError } from "../../plugins/error-handler.plugin";
import { keyByUser } from "../../plugins/rate-limit.plugin";
import { findUserById } from "./auth.repository";
import {
  completePasswordResetSchema,
  deleteAccountSchema,
  linkPhoneRequestSchema,
  linkPhoneVerifySchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
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
  // --- Registration: email + password, no SMS round trip ---

  app.post("/register", { config: codeRequestLimit }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const result = await authService.register(input, sessionMeta(request));
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

  // --- Linking a phone number (funds top-ups once verified) ---

  app.post(
    "/phone/link/request",
    { preHandler: app.authenticate, config: codeRequestLimit },
    async (request, reply) => {
      const { phone } = linkPhoneRequestSchema.parse(request.body);
      await authService.requestLinkPhone(request.user!.id, phone);
      reply.status(202).send({ ok: true });
    }
  );

  app.post(
    "/phone/link/verify",
    { preHandler: app.authenticate, config: codeRequestLimit },
    async (request, reply) => {
      const { phone, code } = linkPhoneVerifySchema.parse(request.body);
      const user = await authService.completeLinkPhone(request.user!.id, phone, code);
      reply.send({ user });
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
