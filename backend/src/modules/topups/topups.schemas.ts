import { z } from "zod";
import { TOPUP_STATUS } from "../../config/constants";

export const createTopupSchema = z.object({
  sender_phone: z.string().trim().min(1),
  // Optional: a customer who doesn't know the exact figure yet (or doesn't want to
  // bother declaring one) can omit it and transfer any amount — see
  // sms.repository.ts `findMatchCandidates`, which then credits whatever the SMS says.
  requested_amount: z.coerce.number().positive().max(1_000_000).optional(),
});
export type CreateTopupInput = z.infer<typeof createTopupSchema>;

export const listTopupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(Object.values(TOPUP_STATUS) as [string, ...string[]]).optional(),
});
