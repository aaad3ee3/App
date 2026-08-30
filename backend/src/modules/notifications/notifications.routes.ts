import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as repo from "./notifications.repository";

const registerSchema = z.object({
  // FCM tokens are long opaque strings; bound the length so a junk value can't bloat the
  // table, but stay well clear of the ~200-char tokens FCM actually issues.
  token: z.string().trim().min(20).max(500),
  platform: z.enum(["android", "ios", "web"]),
});

const unregisterSchema = z.object({ token: z.string().trim().min(20).max(500) });

export default async function notificationsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post("/devices", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    await repo.upsertDeviceToken({
      userId: request.user!.id,
      token: input.token,
      platform: input.platform,
    });
    reply.status(204).send();
  });

  // Called on sign-out so a shared or resold phone stops receiving this account's
  // notifications, which name order amounts and card codes.
  app.post("/devices/unregister", async (request, reply) => {
    const input = unregisterSchema.parse(request.body);
    await repo.deleteTokenForUser(request.user!.id, input.token);
    reply.status(204).send();
  });
}
