import type { Knex } from "knex";
import { HttpError } from "../../plugins/error-handler.plugin";
import type { CouponRow } from "../../db/types";
import * as repo from "./coupons.repository";

export interface CouponQuote {
  coupon: CouponRow;
  discountAmount: number;
}

/**
 * Validates a coupon against an order amount and computes the discount, without applying
 * it. Shared by the checkout preview endpoint (coupons.routes.ts) and `applyCoupon` below,
 * which re-validates inside the order transaction — state (uses left, enabled) can change
 * between the two calls, so the preview is advisory only, never trusted for the real debit.
 */
export async function quoteCoupon(
  userId: string,
  code: string,
  orderAmount: number,
  trx?: Knex | Knex.Transaction
): Promise<CouponQuote> {
  const coupon = await repo.findByCode(code, trx);
  if (!coupon || !coupon.enabled) {
    throw new HttpError(404, "coupon_not_found", "كود الخصم غير صحيح");
  }
  if (coupon.expires_at && coupon.expires_at.getTime() < Date.now()) {
    throw new HttpError(409, "coupon_expired", "انتهت صلاحية كود الخصم");
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    throw new HttpError(409, "coupon_exhausted", "تم استخدام كود الخصم بالكامل");
  }
  if (orderAmount < Number(coupon.min_order_amount)) {
    throw new HttpError(
      409,
      "coupon_min_order_not_met",
      `هذا الكود يتطلب طلباً بقيمة ${Number(coupon.min_order_amount).toFixed(2)} د.ل على الأقل`
    );
  }
  const usedByUser = await repo.countUserRedemptions(coupon.id, userId, trx);
  if (usedByUser >= coupon.max_uses_per_user) {
    throw new HttpError(409, "coupon_already_used", "سبق أن استخدمت هذا الكود");
  }

  const rawDiscount =
    coupon.discount_type === "percent"
      ? (orderAmount * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  // Never let a coupon make the order free-or-negative — the discount is capped at the
  // order's own value.
  const discountAmount = Math.min(rawDiscount, orderAmount);

  return { coupon, discountAmount: Math.round(discountAmount * 10000) / 10000 };
}

/**
 * Re-validates and atomically claims one use of the coupon inside the caller's order
 * transaction, then records the redemption. Throws `coupon_exhausted` if a concurrent
 * order used up the last slot between the checkout preview and this call.
 */
export async function applyCoupon(
  trx: Knex.Transaction,
  userId: string,
  orderId: string,
  code: string,
  orderAmount: number
): Promise<CouponQuote> {
  const quote = await quoteCoupon(userId, code, orderAmount, trx);

  const claimed = await repo.claimUse(quote.coupon.id, trx);
  if (!claimed) {
    throw new HttpError(409, "coupon_exhausted", "تم استخدام كود الخصم بالكامل للتو");
  }
  await repo.insertRedemption(
    { couponId: quote.coupon.id, userId, orderId, discountAmount: quote.discountAmount },
    trx
  );
  return quote;
}

// --- Admin CRUD ---

function validateDiscountValue(discountType: "percent" | "fixed", discountValue: number): void {
  if (discountType === "percent" && (discountValue <= 0 || discountValue > 100)) {
    throw new HttpError(400, "invalid_discount_value", "نسبة الخصم يجب أن تكون بين 1 و 100");
  }
  if (discountType === "fixed" && discountValue <= 0) {
    throw new HttpError(400, "invalid_discount_value", "قيمة الخصم يجب أن تكون أكبر من صفر");
  }
}

export async function listCoupons() {
  return repo.listAll();
}

export async function createCoupon(input: repo.CreateCouponInput): Promise<CouponRow> {
  validateDiscountValue(input.discountType, input.discountValue);
  try {
    return await repo.create(input);
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      throw new HttpError(409, "coupon_code_taken", "هذا الكود مستخدم بالفعل");
    }
    throw err;
  }
}

export async function updateCoupon(id: string, fields: repo.UpdateCouponInput): Promise<{ ok: true }> {
  if (fields.discountType && fields.discountValue !== undefined) {
    validateDiscountValue(fields.discountType, fields.discountValue);
  }
  const updated = await repo.update(id, fields);
  if (!updated) throw new HttpError(404, "not_found", "Coupon not found");
  return { ok: true };
}
