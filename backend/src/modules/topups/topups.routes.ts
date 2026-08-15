import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { keyByUser } from "../../plugins/rate-limit.plugin";
import { createTopupSchema, listTopupsQuerySchema } from "./topups.schemas";
import * as topupsService from "./topups.service";

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function topupsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post(
    "/",
    {
      // Per user rather than per IP — each request creates a pending top-up that the SMS
      // matcher then has to consider, so a loop here both spams the table and muddies
      // matching for everyone else on that phone number.
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_TOPUP_MAX,
          timeWindow: env.RATE_LIMIT_TOPUP_WINDOW_MS,
          keyGenerator: keyByUser,
        },
      },
    },
    async (request, reply) => {
      const input = createTopupSchema.parse(request.body);
      const row = await topupsService.createTopup(request.user!.id, input);
      reply.status(201).send(row);
    }
  );

  app.get("/", async (request) => {
    const { page, page_size, status } = listTopupsQuerySchema.parse(request.query);
    return topupsService.listMyTopups(request.user!.id, page, page_size, status);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return topupsService.getMyTopup(request.user!.id, id);
  });

  app.post("/:id/cancel", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return topupsService.cancelMyTopup(request.user!.id, id);
  });
}
