import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OrderStatus } from "../../db/types";
import {
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
  updateProductAdminSchema,
} from "./admin.schemas";
import * as adminService from "./admin.service";

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

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

  app.post("/topup-requests/:id/credit-manually", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { amount, note } = creditTopupManuallySchema.parse(request.body);
    return adminService.creditTopupManually(request.user!.id, id, amount, note);
  });

  app.get("/users", async (request) => {
    const { page, page_size } = listUsersQuerySchema.parse(request.query);
    return adminService.listUsers(page, page_size);
  });

  app.get("/users/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return adminService.getUserDetail(id);
  });

  // --- Catalog ---

  app.post("/catalog/sync", async () => {
    return adminService.syncCatalog();
  });

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

  app.post("/orders/:id/refund", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const { note } = resolveOrderSchema.parse(request.body);
    return adminService.refundOrderAdmin(request.user!.id, id, note);
  });
}
