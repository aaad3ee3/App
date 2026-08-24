import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { CouponRow } from "../../db/types";

export function findByCode(code: string, trx: Knex | Knex.Transaction = db): Promise<CouponRow | undefined> {
  return trx<CouponRow>("coupons").whereRaw("upper(code) = upper(?)", [code.trim()]).first();
}

export function findById(id: string, trx: Knex | Knex.Transaction = db): Promise<CouponRow | undefined> {
  return trx<CouponRow>("coupons").where({ id }).first();
}

export function countUserRedemptions(couponId: string, userId: string, trx: Knex | Knex.Transaction = db): Promise<number> {
  return trx("coupon_redemptions")
    .where({ coupon_id: couponId, user_id: userId })
    .count<{ count: string }[]>("id as count")
    .then((rows) => Number(rows[0]?.count ?? 0));
}

/**
 * Atomically claims one use of the coupon: increments `used_count` only if it's still
 * below `max_uses` (or `max_uses` is unlimited). Returns false if the coupon was exhausted
 * by a concurrent redemption — the row lock Postgres takes for the UPDATE serializes this
 * against any other in-flight redemption of the same coupon, the same pattern
 * wallet.repository.ts's `creditWallet` uses for the balance check.
 */
export async function claimUse(couponId: string, trx: Knex.Transaction): Promise<boolean> {
  const updated = await trx("coupons")
    .where({ id: couponId })
    .andWhere((qb) => qb.whereNull("max_uses").orWhereRaw("used_count < max_uses"))
    .update({ used_count: db.raw("used_count + 1"), updated_at: new Date() });
  return updated > 0;
}

export function insertRedemption(
  input: { couponId: string; userId: string; orderId: string; discountAmount: number },
  trx: Knex.Transaction
): Promise<void> {
  return trx("coupon_redemptions").insert({
    coupon_id: input.couponId,
    user_id: input.userId,
    order_id: input.orderId,
    discount_amount: input.discountAmount.toFixed(4),
  });
}

// --- Admin CRUD ---

export function listAll(): Promise<CouponRow[]> {
  return db<CouponRow>("coupons").orderBy("created_at", "desc");
}

export interface CreateCouponInput {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrderAmount: number;
  maxUses: number | null;
  maxUsesPerUser: number;
  expiresAt: Date | null;
}

export async function create(input: CreateCouponInput): Promise<CouponRow> {
  const [row] = await db<CouponRow>("coupons")
    .insert({
      code: input.code.trim(),
      discount_type: input.discountType,
      discount_value: input.discountValue.toFixed(3),
      min_order_amount: input.minOrderAmount.toFixed(3),
      max_uses: input.maxUses,
      max_uses_per_user: input.maxUsesPerUser,
      expires_at: input.expiresAt,
    })
    .returning("*");
  if (!row) throw new Error("Failed to create coupon");
  return row;
}

export interface UpdateCouponInput {
  discountType?: "percent" | "fixed";
  discountValue?: number;
  minOrderAmount?: number;
  maxUses?: number | null;
  maxUsesPerUser?: number;
  enabled?: boolean;
  expiresAt?: Date | null;
}

export function update(id: string, fields: UpdateCouponInput): Promise<number> {
  const update: Record<string, unknown> = { updated_at: new Date() };
  if (fields.discountType !== undefined) update.discount_type = fields.discountType;
  if (fields.discountValue !== undefined) update.discount_value = fields.discountValue.toFixed(3);
  if (fields.minOrderAmount !== undefined) update.min_order_amount = fields.minOrderAmount.toFixed(3);
  if (fields.maxUses !== undefined) update.max_uses = fields.maxUses;
  if (fields.maxUsesPerUser !== undefined) update.max_uses_per_user = fields.maxUsesPerUser;
  if (fields.enabled !== undefined) update.enabled = fields.enabled;
  if (fields.expiresAt !== undefined) update.expires_at = fields.expiresAt;
  return db("coupons").where({ id }).update(update);
}
