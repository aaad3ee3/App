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

export const updateCategoryImageSchema = z.object({
  // An empty string is a deliberate valid input — it clears the override (see
  // catalogRepo.updateCategoryImage) — so this isn't .url(); actual URL validation
  // happens in sanitizeImageUrl at the repository choke point.
  image: z.string().trim().max(2000),
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

export const createCouponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  discount_type: z.enum(["percent", "fixed"]),
  discount_value: z.coerce.number().positive(),
  min_order_amount: z.coerce.number().nonnegative().default(0),
  max_uses: z.coerce.number().int().positive().nullable().optional(),
  max_uses_per_user: z.coerce.number().int().positive().default(1),
  expires_at: z.coerce.date().nullable().optional(),
});

export const updateCouponSchema = z.object({
  discount_type: z.enum(["percent", "fixed"]).optional(),
  discount_value: z.coerce.number().positive().optional(),
  min_order_amount: z.coerce.number().nonnegative().optional(),
  max_uses: z.coerce.number().int().positive().nullable().optional(),
  max_uses_per_user: z.coerce.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  expires_at: z.coerce.date().nullable().optional(),
});
