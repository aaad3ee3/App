import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as catalogRepo from "../catalog/catalog.repository";
import { HttpError } from "../../plugins/error-handler.plugin";
import * as couponsService from "./coupons.service";

const previewSchema = z.object({
  code: z.string().trim().min(1).max(40),
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1),
});

export default async function couponsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  // Lets the checkout screen show the discounted total before the customer commits to a
  // purchase. Read-only and non-binding — see coupons.service.ts `applyCoupon` for the
  // real, re-validated claim that happens inside createOrder.
  app.post("/preview", async (request) => {
    const { code, product_id, quantity } = previewSchema.parse(request.body);
    const product = await catalogRepo.getProductById(product_id);
    if (!product || !product.available) {
      throw new HttpError(404, "not_found", "Product not found or unavailable");
    }
    const unitPrice = product.price_per_1000 ? Number(product.sell_price) / 1000 : Number(product.sell_price);
    const orderAmount = Math.round(unitPrice * quantity * 10000) / 10000;

    const { discountAmount } = await couponsService.quoteCoupon(request.user!.id, code, orderAmount);
    return {
      order_amount: orderAmount,
      discount_amount: discountAmount,
      total_after_discount: Math.round((orderAmount - discountAmount) * 10000) / 10000,
    };
  });
}
