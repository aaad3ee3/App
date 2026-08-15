import { z } from "zod";
import { TOPUP_STATUS } from "../../config/constants";

export const createTopupSchema = z.object({
  sender_phone: z.string().trim().min(1),
  requested_amount: z.coerce.number().positive().max(1_000_000),
});
export type CreateTopupInput = z.infer<typeof createTopupSchema>;

export const listTopupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(Object.values(TOPUP_STATUS) as [string, ...string[]]).optional(),
});
