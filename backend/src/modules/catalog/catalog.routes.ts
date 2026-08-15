import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as catalogService from "./catalog.service";

const listCategoriesQuerySchema = z.object({ kind: z.enum(["giftcard", "smm"]).optional() });
const idParamSchema = z.object({ id: z.string().uuid() });

export default async function catalogRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/categories", async (request) => {
    const { kind } = listCategoriesQuerySchema.parse(request.query);
    return { items: await catalogService.listCategories(kind) };
  });

  app.get("/categories/:id/products", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return { items: await catalogService.listProducts(id) };
  });
}
