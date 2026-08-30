import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { keyByUser } from "../../plugins/rate-limit.plugin";
import * as service from "./binance-topup.service";

const verifySchema = z.object({
  order_id: z.string().trim().min(1).max(200),
});

export default async function binanceTopupRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post(
    "/verify",
    {
      // Keyed per user: this calls out to Binance's API and, on success, credits real
      // money — the same reasoning as the order-creation rate limit.
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_ORDER_MAX,
          timeWindow: env.RATE_LIMIT_ORDER_WINDOW_MS,
          keyGenerator: keyByUser,
        },
      },
    },
    async (request) => {
      const { order_id } = verifySchema.parse(request.body);
      return service.verifyAndCredit(request.user!.id, order_id);
    }
  );

  app.get("/", async (request) => {
    return service.listMyTopups(request.user!.id);
  });
}
