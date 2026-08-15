import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  creditTopupManuallySchema,
  ignoreSmsEventSchema,
  listSmsEventsQuerySchema,
  listTopupRequestsQuerySchema,
  listUsersQuerySchema,
  rejectTopupSchema,
  resolveSmsEventSchema,
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
}
