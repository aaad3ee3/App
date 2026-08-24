import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as favoritesService from "./favorites.service";

const productIdParamSchema = z.object({ productId: z.string().uuid() });

export default async function favoritesRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (request) => {
    return favoritesService.listMyFavorites(request.user!.id);
  });

  // Plain id list, cheap enough to fetch alongside a category/search screen so the star
  // icon can render its filled state without a per-product lookup.
  app.get("/ids", async (request) => {
    return { items: await favoritesService.listMyFavoriteIds(request.user!.id) };
  });

  app.post("/:productId", async (request) => {
    const { productId } = productIdParamSchema.parse(request.params);
    return favoritesService.addFavorite(request.user!.id, productId);
  });

  app.delete("/:productId", async (request) => {
    const { productId } = productIdParamSchema.parse(request.params);
    return favoritesService.removeFavorite(request.user!.id, productId);
  });
}
