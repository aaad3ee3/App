import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTopupSchema, listTopupsQuerySchema } from "./topups.schemas";
import * as topupsService from "./topups.service";

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function topupsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/", async (request, reply) => {
    const input = createTopupSchema.parse(request.body);
    const row = await topupsService.createTopup(request.user!.id, input);
    reply.status(201).send(row);
  });

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
