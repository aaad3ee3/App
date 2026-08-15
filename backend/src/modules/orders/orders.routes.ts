import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as ordersService from "./orders.service";

const createOrderSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive().optional(),
  target_link: z.string().trim().min(1).max(2000).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function ordersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/", async (request, reply) => {
    const input = createOrderSchema.parse(request.body);
    const order = await ordersService.createOrder(request.user!.id, {
      productId: input.product_id,
      quantity: input.quantity,
      targetLink: input.target_link,
    });
    reply.status(201).send(order);
  });

  app.get("/", async (request) => {
    const { page, page_size } = listQuerySchema.parse(request.query);
    return ordersService.listMyOrders(request.user!.id, page, page_size);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return ordersService.getMyOrder(request.user!.id, id);
  });
}
