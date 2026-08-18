import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { keyByUser } from "../../plugins/rate-limit.plugin";
import * as catalogService from "./catalog.service";

const listCategoriesQuerySchema = z.object({ kind: z.enum(["giftcard", "smm"]).optional() });
const idParamSchema = z.object({ id: z.string().uuid() });

const searchQuerySchema = z.object({
  // Capped because the query becomes a LIKE pattern: length here is work in the database.
  q: z.string().min(1).max(60),
  kind: z.enum(["giftcard", "smm"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

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

  app.get(
    "/search",
    {
      // Keyed by account rather than IP: search-as-you-type fires several requests per
      // query, and customers on one mobile carrier share an address. The ceiling is high
      // enough for real typing and low enough that nobody can scrape the catalog with it.
      config: { rateLimit: { max: 60, timeWindow: 60_000, keyGenerator: keyByUser } },
    },
    async (request) => {
      const { q, kind, limit } = searchQuerySchema.parse(request.query);
      return { items: await catalogService.searchCatalog(q, kind, limit) };
    }
  );
}
