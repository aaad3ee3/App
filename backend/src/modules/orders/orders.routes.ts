import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { keyByUser } from "../../plugins/rate-limit.plugin";
import * as ordersService from "./orders.service";

const createOrderSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive().optional(),
  target_link: z.string().trim().min(1).max(2000).optional(),
  // social_topup only — values keyed by whatever field labels the product declares (e.g.
  // "معرف المستخدم"). Capped the same as target_link against an oversized payload.
  social_params: z.record(z.string(), z.string().trim().min(1).max(2000)).optional(),
  coupon_code: z.string().trim().min(1).max(40).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function ordersRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.post(
    "/",
    {
      // Keyed per user, not per IP: this endpoint debits a wallet and calls a paid
      // supplier API, so one account must not be able to fire it in a tight loop even
      // from an address it shares with legitimate customers.
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_ORDER_MAX,
          timeWindow: env.RATE_LIMIT_ORDER_WINDOW_MS,
          keyGenerator: keyByUser,
        },
      },
    },
    async (request, reply) => {
      const input = createOrderSchema.parse(request.body);
      const order = await ordersService.createOrder(request.user!.id, {
        productId: input.product_id,
        quantity: input.quantity,
        targetLink: input.target_link,
        socialParams: input.social_params,
        couponCode: input.coupon_code,
      });
      reply.status(201).send(order);
    }
  );

  app.get("/", async (request) => {
    const { page, page_size } = listQuerySchema.parse(request.query);
    return ordersService.listMyOrders(request.user!.id, page, page_size);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return ordersService.getMyOrder(request.user!.id, id);
  });
}
