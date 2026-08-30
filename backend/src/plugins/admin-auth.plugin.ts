import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "./error-handler.plugin";

declare module "fastify" {
  interface FastifyInstance {
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Requires `authenticate` (auth.plugin.ts) to have already run — register this plugin
 * after auth.plugin.ts, and use both as preHandlers: `{ preHandler: [app.authenticate, app.requireAdmin] }`.
 */
export default fp(
  async function adminAuthPlugin(app: FastifyInstance) {
    app.decorate("requireAdmin", async function requireAdmin(request: FastifyRequest) {
      if (!request.user?.isAdmin) {
        throw new HttpError(403, "forbidden", "Admin access required");
      }
    });
  },
  { name: "adminAuthPlugin", dependencies: ["authPlugin"] }
);
