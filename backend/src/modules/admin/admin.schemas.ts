import { z } from "zod";
import { ORDER_STATUS, SMS_MATCH_STATUS, TOPUP_STATUS } from "../../config/constants";

export const listSmsEventsQuerySchema = z.object({
  match_status: z.enum(Object.values(SMS_MATCH_STATUS) as [string, ...string[]]).optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

export const resolveSmsEventSchema = z.object({
  topup_request_id: z.string().uuid(),
});

export const ignoreSmsEventSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});

export const listTopupRequestsQuerySchema = z.object({
  status: z.enum(Object.values(TOPUP_STATUS) as [string, ...string[]]).optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

export const rejectTopupSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});

export const creditTopupManuallySchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  note: z.string().trim().min(1).max(1000),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

export const listProductsAdminQuerySchema = z.object({
  category_id: z.string().uuid().optional(),
});

export const setCategoryEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const updateProductAdminSchema = z.object({
  sell_price: z.coerce.number().positive().optional(),
  available: z.boolean().optional(),
});

export const listOrdersQuerySchema = z.object({
  status: z.enum(Object.values(ORDER_STATUS) as [string, ...string[]]),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

export const resolveOrderSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});
