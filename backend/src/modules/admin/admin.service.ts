import { db } from "../../db/knex";
import { SMS_MATCH_STATUS, TOPUP_STATUS, WALLET_TX_REFERENCE_TYPES, WALLET_TX_TYPES } from "../../config/constants";
import { HttpError } from "../../plugins/error-handler.plugin";
import type { OrderStatus, SmsMatchStatus, TopupStatus } from "../../db/types";
import { LibyaPlayAdapter } from "../../adapters/giftcards/libyaplay.adapter";
import { LibyaPlaySocialAdapter } from "../../adapters/social/libyaplay-social.adapter";
import { PlusAdapter } from "../../adapters/smm/plus.adapter";
import * as catalogRepo from "../catalog/catalog.repository";
import * as catalogSyncService from "../catalog/catalog-sync.service";
import * as ordersService from "../orders/orders.service";
import * as smsRepo from "../sms/sms.repository";
import * as topupsRepo from "../topups/topups.repository";
import * as binanceTopupRepo from "../binance-topup/binance-topup.repository";
import * as walletRepo from "../wallet/wallet.repository";
import * as notifications from "../notifications/notifications.service";
import * as couponsService from "../coupons/coupons.service";
import * as adminRepo from "./admin.repository";

export async function listSmsEvents(matchStatus: string | undefined, page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return smsRepo.listEventsByMatchStatus(matchStatus as SmsMatchStatus | undefined, { limit, offset });
}

const RESOLVABLE_EVENT_STATUSES: SmsMatchStatus[] = [SMS_MATCH_STATUS.UNMATCHED, SMS_MATCH_STATUS.AMBIGUOUS];
const NON_CREDITABLE_TOPUP_STATUSES: TopupStatus[] = [TOPUP_STATUS.CREDITED, TOPUP_STATUS.CANCELLED];

export async function resolveSmsEvent(adminId: string, eventId: string, topupRequestId: string) {
  return db.transaction(async (trx) => {
    const event = await trx("sms_events").where({ id: eventId }).forUpdate().first();
    if (!event) throw new HttpError(404, "not_found", "SMS event not found");
    if (!RESOLVABLE_EVENT_STATUSES.includes(event.match_status)) {
      throw new HttpError(409, "invalid_state", `Cannot resolve an event in match_status '${event.match_status}'`);
    }

    const topup = await trx("topup_requests").where({ id: topupRequestId }).forUpdate().first();
    if (!topup) throw new HttpError(404, "not_found", "Top-up request not found");
    if (NON_CREDITABLE_TOPUP_STATUSES.includes(topup.status)) {
      throw new HttpError(409, "invalid_state", `Cannot credit a top-up request in status '${topup.status}'`);
    }
    if (!event.parsed_amount) {
      throw new HttpError(409, "invalid_state", "Event has no parsed amount to credit");
    }

    const wallet = await walletRepo.getWalletByUserId(topup.user_id, trx);
    if (!wallet) throw new HttpError(404, "not_found", "Wallet not found for top-up owner");

    const walletTx = await walletRepo.creditWallet(trx, {
      userId: topup.user_id,
      walletId: wallet.id,
      amount: Number(event.parsed_amount),
      type: WALLET_TX_TYPES.TOPUP_CREDIT,
      referenceType: WALLET_TX_REFERENCE_TYPES.TOPUP_REQUEST,
      referenceId: topup.id,
      idempotencyKey: `sms_event:${eventId}`,
      createdBy: adminId,
      note: `Manually resolved by admin`,
    });

    await trx("topup_requests").where({ id: topup.id }).update({
      status: TOPUP_STATUS.CREDITED,
      matched_sms_event_id: eventId,
      credited_wallet_transaction_id: walletTx?.id ?? null,
      updated_at: new Date(),
    });

    await smsRepo.updateEventOutcome(
      eventId,
      {
        matchStatus: SMS_MATCH_STATUS.MANUALLY_RESOLVED,
        matchedTopupRequestId: topup.id,
        resolvedBy: adminId,
        processedAt: new Date(),
      },
      trx
    );

    await adminRepo.logAction(
      { adminUserId: adminId, action: "resolve_sms_event", targetType: "sms_event", targetId: eventId, details: { topupRequestId } },
      trx
    );

    return { ok: true };
  });
}

export async function ignoreSmsEvent(adminId: string, eventId: string, note: string) {
  const event = await smsRepo.findEventById(eventId);
  if (!event) throw new HttpError(404, "not_found", "SMS event not found");
  if (!RESOLVABLE_EVENT_STATUSES.includes(event.match_status)) {
    throw new HttpError(409, "invalid_state", `Cannot ignore an event in match_status '${event.match_status}'`);
  }

  await smsRepo.updateEventOutcome(eventId, {
    matchStatus: SMS_MATCH_STATUS.MANUALLY_RESOLVED,
    resolvedBy: adminId,
    resolutionNote: note,
    processedAt: new Date(),
  });
  await adminRepo.logAction({ adminUserId: adminId, action: "ignore_sms_event", targetType: "sms_event", targetId: eventId, details: { note } });
  return { ok: true };
}

export async function listTopupRequests(status: string | undefined, page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return topupsRepo.listAll({ limit, offset, status: status as TopupStatus | undefined });
}

const REJECTABLE_TOPUP_STATUSES: TopupStatus[] = [TOPUP_STATUS.PENDING, TOPUP_STATUS.MANUAL_REVIEW];

export async function rejectTopup(adminId: string, topupId: string, note: string) {
  return db.transaction(async (trx) => {
    const topup = await trx("topup_requests").where({ id: topupId }).forUpdate().first();
    if (!topup) throw new HttpError(404, "not_found", "Top-up request not found");
    if (!REJECTABLE_TOPUP_STATUSES.includes(topup.status)) {
      throw new HttpError(409, "invalid_state", `Cannot reject a top-up request in status '${topup.status}'`);
    }
    await trx("topup_requests").where({ id: topupId }).update({ status: TOPUP_STATUS.CANCELLED, updated_at: new Date() });
    await adminRepo.logAction(
      { adminUserId: adminId, action: "reject_topup", targetType: "topup_request", targetId: topupId, details: { note } },
      trx
    );
    return { ok: true };
  });
}

export async function creditTopupManually(adminId: string, topupId: string, amount: number, note: string) {
  return db.transaction(async (trx) => {
    const topup = await trx("topup_requests").where({ id: topupId }).forUpdate().first();
    if (!topup) throw new HttpError(404, "not_found", "Top-up request not found");
    if (NON_CREDITABLE_TOPUP_STATUSES.includes(topup.status)) {
      throw new HttpError(409, "invalid_state", `Cannot credit a top-up request in status '${topup.status}'`);
    }

    const wallet = await walletRepo.getWalletByUserId(topup.user_id, trx);
    if (!wallet) throw new HttpError(404, "not_found", "Wallet not found for top-up owner");

    const walletTx = await walletRepo.creditWallet(trx, {
      userId: topup.user_id,
      walletId: wallet.id,
      amount,
      type: WALLET_TX_TYPES.ADMIN_ADJUSTMENT,
      referenceType: WALLET_TX_REFERENCE_TYPES.TOPUP_REQUEST,
      referenceId: topup.id,
      idempotencyKey: `admin_manual_topup:${topupId}`,
      createdBy: adminId,
      note,
    });

    if (walletTx) {
      await trx("topup_requests").where({ id: topupId }).update({
        status: TOPUP_STATUS.CREDITED,
        credited_wallet_transaction_id: walletTx.id,
        updated_at: new Date(),
      });
    }

    await adminRepo.logAction(
      { adminUserId: adminId, action: "manual_credit", targetType: "topup_request", targetId: topupId, details: { amount, note } },
      trx
    );

    return { ok: true, already_applied: walletTx === null };
  });
}

export async function listBinanceTopups(page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return binanceTopupRepo.listAllAdmin({ limit, offset });
}

export async function listUsers(page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return adminRepo.listUsers({ limit, offset });
}

export async function getUserDetail(userId: string) {
  const row = await adminRepo.getUserDetail(userId);
  if (!row) throw new HttpError(404, "not_found", "User not found");
  return row;
}

// --- Catalog ---

export async function syncCatalog() {
  const [libyaPlay, libyaPlaySocial, plus] = await Promise.all([
    catalogSyncService.syncLibyaPlay(new LibyaPlayAdapter()),
    catalogSyncService.syncLibyaPlaySocial(new LibyaPlaySocialAdapter()),
    catalogSyncService.syncPlus(new PlusAdapter()),
  ]);
  return { libya_play: libyaPlay, libya_play_social: libyaPlaySocial, plus };
}

export async function listCategoriesAdmin() {
  return catalogRepo.listAllCategoriesAdmin();
}

export async function listProductsAdmin(categoryId?: string) {
  return catalogRepo.listAllProductsAdmin(categoryId);
}

export async function setCategoryEnabled(adminId: string, categoryId: string, enabled: boolean) {
  const updated = await catalogRepo.setCategoryEnabled(categoryId, enabled);
  if (!updated) throw new HttpError(404, "not_found", "Category not found");
  // Reuses the 'product' target_type — categories/products are close enough kin that a
  // dedicated enum value isn't worth another migration for this.
  await adminRepo.logAction({ adminUserId: adminId, action: "set_category_enabled", targetType: "product", targetId: categoryId, details: { enabled } });
  return { ok: true };
}

export async function updateCategoryImage(adminId: string, categoryId: string, image: string) {
  const updated = await catalogRepo.updateCategoryImage(categoryId, image);
  if (!updated) throw new HttpError(404, "not_found", "Category not found");
  await adminRepo.logAction({ adminUserId: adminId, action: "update_category_image", targetType: "product", targetId: categoryId, details: { image } });
  return { ok: true };
}

export async function updateProductAdmin(
  adminId: string,
  productId: string,
  fields: { sellPrice?: number; available?: boolean }
) {
  const updated = await catalogRepo.updateProductOverride(productId, fields);
  if (!updated) throw new HttpError(404, "not_found", "Product not found");
  await adminRepo.logAction({ adminUserId: adminId, action: "update_product", targetType: "product", targetId: productId, details: fields });
  return { ok: true };
}

// --- Orders ---

export async function listOrdersByStatus(status: OrderStatus, page: number, pageSize: number) {
  return ordersService.adminListByStatus(status, page, pageSize);
}

export async function resolveAmbiguousOrderCompleted(adminId: string, orderId: string, note: string) {
  const order = await ordersService.adminMarkAmbiguousAsCompleted(orderId, note);
  await adminRepo.logAction({ adminUserId: adminId, action: "mark_order_completed", targetType: "order", targetId: orderId, details: { note } });
  void notifications.notifyOrderCompleted(order.user_id, "طلبك", Boolean(order.supplier_response));
  return order;
}

export async function refundOrderAdmin(adminId: string, orderId: string, note: string) {
  const order = await ordersService.adminRefundOrder(orderId, note);
  await adminRepo.logAction({ adminUserId: adminId, action: "refund_order", targetType: "order", targetId: orderId, details: { note } });
  // The customer has been waiting on a stuck order; tell them their money is back.
  void notifications.notifyOrderRefunded(order.user_id, Number(order.total_price).toFixed(3));
  return order;
}

// --- Coupons ---

export async function listCoupons() {
  return { items: await couponsService.listCoupons() };
}

export async function createCoupon(
  adminId: string,
  input: {
    code: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    min_order_amount: number;
    max_uses?: number | null;
    max_uses_per_user: number;
    expires_at?: Date | null;
  }
) {
  const coupon = await couponsService.createCoupon({
    code: input.code,
    discountType: input.discount_type,
    discountValue: input.discount_value,
    minOrderAmount: input.min_order_amount,
    maxUses: input.max_uses ?? null,
    maxUsesPerUser: input.max_uses_per_user,
    expiresAt: input.expires_at ?? null,
  });
  // Reuses the 'product' target_type, same as category/product admin actions above — not
  // worth a dedicated enum value (and migration) for one more kind of catalog-adjacent edit.
  await adminRepo.logAction({ adminUserId: adminId, action: "create_coupon", targetType: "product", targetId: coupon.id, details: { code: coupon.code } });
  return coupon;
}

export async function updateCoupon(
  adminId: string,
  couponId: string,
  fields: {
    discount_type?: "percent" | "fixed";
    discount_value?: number;
    min_order_amount?: number;
    max_uses?: number | null;
    max_uses_per_user?: number;
    enabled?: boolean;
    expires_at?: Date | null;
  }
) {
  const result = await couponsService.updateCoupon(couponId, {
    discountType: fields.discount_type,
    discountValue: fields.discount_value,
    minOrderAmount: fields.min_order_amount,
    maxUses: fields.max_uses,
    maxUsesPerUser: fields.max_uses_per_user,
    enabled: fields.enabled,
    expiresAt: fields.expires_at,
  });
  await adminRepo.logAction({ adminUserId: adminId, action: "update_coupon", targetType: "product", targetId: couponId, details: fields });
  return result;
}
