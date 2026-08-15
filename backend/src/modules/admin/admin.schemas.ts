import { z } from "zod";
import { SMS_MATCH_STATUS, TOPUP_STATUS } from "../../config/constants";

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
