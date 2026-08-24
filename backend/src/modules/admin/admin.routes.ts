import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { keyByUser } from "../../plugins/rate-limit.plugin";
import type { OrderStatus } from "../../db/types";
import {
  createCouponSchema,
  creditTopupManuallySchema,
  ignoreSmsEventSchema,
  listOrdersQuerySchema,
  listProductsAdminQuerySchema,
  listSmsEventsQuerySchema,
  listTopupRequestsQuerySchema,
  listUsersQuerySchema,
  rejectTopupSchema,
  resolveOrderSchema,
  resolveSmsEventSchema,
  setCategoryEnabledSchema,
  updateCategoryImageSchema,
  updateCouponSchema,
  updateProductAdminSchema,
} from "./admin.schemas";
import * as adminService from "./admin.service";

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);
  app.addHook("onRequest", app.requireAdmin);

  app.get("/sms-events", async (request) => {
    const { match_status, page, page_size } = listSmsEventsQuerySchema.parse(request.query);
    return adminService.listSmsEvents(match_status, page, page_size);
  });

  app.post("/sms-events/:id/resolve", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { topup_request_id } = resolveSmsEventSchema.parse(request.body);
    return adminService.resolveSmsEvent(request.user!.id, id, topup_request_id);
  });

  app.post("/sms-events/:id/ignore", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { note } = ignoreSmsEventSchema.parse(request.body);
    return adminService.ignoreSmsEvent(request.user!.id, id, note);
  });

  app.get("/topup-requests", async (request) => {
    const { status, page, page_size } = listTopupRequestsQuerySchema.parse(request.query);
    return adminService.listTopupRequests(status, page, page_size);
  });

  app.post("/topup-requests/:id/reject", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { note } = rejectTopupSchema.parse(request.body);
    return adminService.rejectTopup(request.user!.id, id, note);
  });

  // Credits a wallet directly, so it is the single most abusable endpoint in the app if
  // an admin token is ever stolen. Rate limited per admin on top of the audit log.
  app.post(
    "/topup-requests/:id/credit-manually",
    { config: { rateLimit: { max: env.RATE_LIMIT_ADMIN_WRITE_MAX, timeWindow: env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS, keyGenerator: keyByUser } } },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const { amount, note } = creditTopupManuallySchema.parse(request.body);
      return adminService.creditTopupManually(request.user!.id, id, amount, note);
    }
  );

  app.get("/users", async (request) => {
    const { page, page_size } = listUsersQuerySchema.parse(request.query);
    return adminService.listUsers(page, page_size);
  });

  app.get("/users/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return adminService.getUserDetail(id);
  });

  // --- Catalog ---

  // Walks both suppliers' entire catalogs, so it is by far the heaviest endpoint here and
  // the easiest way for a stolen admin token to burn our supplier API quota.
  app.post(
    "/catalog/sync",
    { config: { rateLimit: { max: 5, timeWindow: env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS, keyGenerator: keyByUser } } },
    async () => {
      return adminService.syncCatalog();
    }
  );

  app.get("/catalog/categories", async () => {
    return { items: await adminService.listCategoriesAdmin() };
  });

  app.get("/catalog/products", async (request) => {
    const { category_id } = listProductsAdminQuerySchema.parse(request.query);
    return { items: await adminService.listProductsAdmin(category_id) };
  });

  app.post("/catalog/categories/:id/enabled", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { enabled } = setCategoryEnabledSchema.parse(request.body);
    return adminService.setCategoryEnabled(request.user!.id, id, enabled);
  });

  app.post("/catalog/categories/:id/image", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { image } = updateCategoryImageSchema.parse(request.body);
    return adminService.updateCategoryImage(request.user!.id, id, image);
  });

  app.post("/catalog/products/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { sell_price, available } = updateProductAdminSchema.parse(request.body);
    return adminService.updateProductAdmin(request.user!.id, id, { sellPrice: sell_price, available });
  });

  // --- Orders ---

  app.get("/orders", async (request) => {
    const { status, page, page_size } = listOrdersQuerySchema.parse(request.query);
    return adminService.listOrdersByStatus(status as OrderStatus, page, page_size);
  });

  app.post("/orders/:id/mark-completed", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { note } = resolveOrderSchema.parse(request.body);
    return adminService.resolveAmbiguousOrderCompleted(request.user!.id, id, note);
  });

  // Also credits a wallet — same reasoning as credit-manually above.
  app.post(
    "/orders/:id/refund",
    { config: { rateLimit: { max: env.RATE_LIMIT_ADMIN_WRITE_MAX, timeWindow: env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS, keyGenerator: keyByUser } } },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const { note } = resolveOrderSchema.parse(request.body);
      return adminService.refundOrderAdmin(request.user!.id, id, note);
    }
  );

  // --- Coupons ---

  app.get("/coupons", async () => {
    return adminService.listCoupons();
  });

  app.post("/coupons", async (request, reply) => {
    const input = createCouponSchema.parse(request.body);
    const coupon = await adminService.createCoupon(request.user!.id, input);
    reply.status(201).send(coupon);
  });

  app.post("/coupons/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const input = updateCouponSchema.parse(request.body);
    return adminService.updateCoupon(request.user!.id, id, input);
  });
}
