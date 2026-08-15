import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/knex";
import { sha256Hex } from "../lib/crypto";
import { HttpError } from "./error-handler.plugin";

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export default fp(
  async function authPlugin(app: FastifyInstance) {
    app.decorateRequest("user", null);

    app.decorate("authenticate", async function authenticate(request: FastifyRequest) {
      const token = extractBearerToken(request.headers.authorization);
      if (!token) {
        throw new HttpError(401, "unauthorized", "Missing bearer token");
      }

      const tokenHash = sha256Hex(token);
      const row = await db("sessions")
        .join("users", "users.id", "sessions.user_id")
        .where("sessions.token_hash", tokenHash)
        .whereNull("sessions.revoked_at")
        .where("sessions.expires_at", ">", new Date())
        .select(
          "users.id as user_id",
          "users.email",
          "users.is_admin as is_admin",
          "users.status as status"
        )
        .first();

      if (!row || row.status !== "active") {
        throw new HttpError(401, "unauthorized", "Invalid or expired session");
      }

      request.user = { id: row.user_id, email: row.email, isAdmin: row.is_admin };
    });
  },
  { name: "authPlugin" }
);
