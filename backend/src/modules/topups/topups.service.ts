import { env } from "../../config/env";
import { normalizeLibyanPhone } from "../../lib/phone";
import { HttpError } from "../../plugins/error-handler.plugin";
import type { TopupStatus } from "../../db/types";
import * as repo from "./topups.repository";
import type { CreateTopupInput } from "./topups.schemas";

export async function createTopup(userId: string, input: CreateTopupInput) {
  const senderPhone = normalizeLibyanPhone(input.sender_phone);
  if (!senderPhone) {
    throw new HttpError(400, "invalid_phone", "sender_phone must be a valid Libyan mobile number");
  }

  const expiresAt = new Date(Date.now() + env.TOPUP_EXPIRY_MINUTES * 60_000);

  try {
    const [row] = await repo.insertPending({
      userId,
      senderPhone,
      requestedAmount: input.requested_amount ?? null,
      expiresAt,
    });
    return row;
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === repo.UNIQUE_VIOLATION && pgErr.constraint === "uq_topups_one_pending_per_user") {
      throw new HttpError(
        409,
        "topup_already_pending",
        "You already have a pending top-up request. Cancel it or wait for it to expire before creating a new one."
      );
    }
    throw err;
  }
}

export async function listMyTopups(userId: string, page: number, pageSize: number, status?: string) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  const { items, total } = await repo.listByUser(userId, {
    limit,
    offset,
    status: status as TopupStatus | undefined,
  });
  return { items, page, page_size: limit, total };
}

export async function getMyTopup(userId: string, id: string) {
  const row = await repo.findById(id);
  if (!row || row.user_id !== userId) {
    throw new HttpError(404, "not_found", "Top-up request not found");
  }
  return row;
}

export async function cancelMyTopup(userId: string, id: string) {
  const row = await repo.findById(id);
  if (!row || row.user_id !== userId) {
    throw new HttpError(404, "not_found", "Top-up request not found");
  }
  if (row.status !== "pending") {
    throw new HttpError(409, "invalid_state", `Cannot cancel a top-up request in status '${row.status}'`);
  }
  await repo.cancelPending(id, userId);
  return { ok: true };
}
