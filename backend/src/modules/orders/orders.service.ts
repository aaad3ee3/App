import crypto from "node:crypto";
import { db } from "../../db/knex";
import { ORDER_STATUS, WALLET_TX_REFERENCE_TYPES, WALLET_TX_TYPES } from "../../config/constants";
import { HttpError } from "../../plugins/error-handler.plugin";
import type { OrderRow, OrderStatus } from "../../db/types";
import { LibyaPlayAdapter } from "../../adapters/giftcards/libyaplay.adapter";
import { LibyaPlayApiError } from "../../adapters/giftcards/libyaplay.client";
import type { GiftCardSupplierAdapter } from "../../adapters/giftcards/giftcard-supplier.interface";
import { LibyaPlaySocialAdapter } from "../../adapters/social/libyaplay-social.adapter";
import type { SocialSupplierAdapter } from "../../adapters/social/social-supplier.interface";
import { PlusAdapter } from "../../adapters/smm/plus.adapter";
import { PlusApiError } from "../../adapters/smm/plus.client";
import type { SmmSupplierAdapter } from "../../adapters/smm/smm-supplier.interface";
import * as catalogRepo from "../catalog/catalog.repository";
import * as walletRepo from "../wallet/wallet.repository";
import * as notifications from "../notifications/notifications.service";
import * as couponsService from "../coupons/coupons.service";
import * as referralService from "../referral/referral.service";
import * as ordersRepo from "./orders.repository";

export interface OrderAdapters {
  giftCard: GiftCardSupplierAdapter;
  smm: SmmSupplierAdapter;
  social: SocialSupplierAdapter;
}

function defaultAdapters(): OrderAdapters {
  return { giftCard: new LibyaPlayAdapter(), smm: new PlusAdapter(), social: new LibyaPlaySocialAdapter() };
}

export interface CreateOrderInput {
  productId: string;
  /** Required for smm and social_topup products; ignored for giftcard (always exactly 1
   *  unit — Libya Play's digt pay endpoint has no quantity param). */
  quantity?: number;
  /** Required for smm products (the URL/username to deliver to); must be absent for
   *  giftcard and social_topup (the latter uses socialParams instead). */
  targetLink?: string;
  /** Required for social_topup products — the values for whatever fields the product
   *  declares (product.required_params), keyed by Libya Play's own field labels (e.g.
   *  "معرف المستخدم"). Must be absent for giftcard and smm. */
  socialParams?: Record<string, string>;
  /** Optional discount code — re-validated and atomically claimed inside the purchase
   *  transaction, see coupons.service.ts `applyCoupon`. */
  couponCode?: string;
}

/**
 * The purchase flow, in two phases:
 *
 * 1. One DB transaction: validate the product, debit the wallet, create the order row
 *    (status 'processing'). No network call happens inside this transaction — a 3rd-party
 *    HTTP call must never happen while holding a DB lock/transaction open.
 * 2. Outside the transaction: call the actual supplier. The result is one of three cases,
 *    and the distinction matters a lot financially:
 *      - success -> mark 'completed' (giftcard) or leave 'processing' with the supplier's
 *        order ref attached (smm — completes asynchronously, see poll-smm-orders.job.ts).
 *      - a definitive error response from the supplier (LibyaPlayApiError / PlusApiError)
 *        -> we KNOW nothing was charged/delivered on their side (auth/validation/balance
 *        errors happen before fulfillment) -> safe to auto-refund, mark 'failed'.
 *      - anything else (network failure, timeout, DNS error, no response at all) -> we
 *        CANNOT tell whether the supplier actually processed the request. Neither Libya
 *        Play's nor Plus's purchase endpoints have an idempotency parameter, so retrying
 *        risks a genuine double-charge and refunding risks giving the customer free
 *        product. Mark 'ambiguous_error' and do nothing else — an admin reconciles this
 *        by hand (see admin.service.ts resolveAmbiguousOrder / refundOrder).
 */
export async function createOrder(
  userId: string,
  input: CreateOrderInput,
  adapters: OrderAdapters = defaultAdapters()
): Promise<OrderRow> {
  const product = await catalogRepo.getProductById(input.productId);
  if (!product || !product.available) {
    throw new HttpError(404, "not_found", "Product not found or unavailable");
  }

  // Browsing already filters to enabled categories (listEnabledCategories), but that
  // alone doesn't stop a purchase: a client that already has the product id — cached,
  // deep-linked, or scraped before an admin disabled the category — could otherwise still
  // buy it. Re-check here so disabling a category actually makes its products unbuyable,
  // not just invisible.
  const category = await catalogRepo.getCategoryById(product.category_id);
  if (!category || !category.enabled) {
    throw new HttpError(404, "not_found", "Product not found or unavailable");
  }

  let quantity: number;
  let targetLink: string | null;
  let socialParams: Record<string, string> | null = null;
  let unitPrice: number;
  let unitCost: number;

  if (product.kind === "giftcard") {
    if (input.quantity !== undefined && input.quantity !== 1) {
      throw new HttpError(400, "invalid_quantity", "Gift card products are always purchased one at a time");
    }
    if (input.targetLink) {
      throw new HttpError(400, "unexpected_target_link", "This product does not accept a target link");
    }
    quantity = 1;
    targetLink = null;
    unitPrice = Number(product.sell_price);
    unitCost = Number(product.cost_price);
  } else if (product.kind === "social_topup") {
    if (input.targetLink) {
      throw new HttpError(400, "unexpected_target_link", "This product does not accept a target link");
    }
    quantity = input.quantity ?? 0;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, "invalid_quantity", "quantity must be a positive integer");
    }
    if (product.min_quantity !== null && quantity < product.min_quantity) {
      throw new HttpError(400, "invalid_quantity", `quantity must be at least ${product.min_quantity}`);
    }
    if (product.max_quantity !== null && quantity > product.max_quantity) {
      throw new HttpError(400, "invalid_quantity", `quantity must be at most ${product.max_quantity}`);
    }
    targetLink = null;
    const requiredParams = product.required_params ?? [];
    const provided = input.socialParams ?? {};
    const collected: Record<string, string> = {};
    for (const key of requiredParams) {
      const value = provided[key]?.trim();
      if (!value) {
        throw new HttpError(400, "missing_param", `"${key}" is required for this product`);
      }
      collected[key] = value;
    }
    socialParams = collected;
    // product.sell_price is already a per-unit rate for social_topup (unlike smm's per-1000).
    unitPrice = Number(product.sell_price);
    unitCost = Number(product.cost_price);
  } else {
    quantity = input.quantity ?? 0;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, "invalid_quantity", "quantity must be a positive integer");
    }
    if (product.min_quantity !== null && quantity < product.min_quantity) {
      throw new HttpError(400, "invalid_quantity", `quantity must be at least ${product.min_quantity}`);
    }
    if (product.max_quantity !== null && quantity > product.max_quantity) {
      throw new HttpError(400, "invalid_quantity", `quantity must be at most ${product.max_quantity}`);
    }
    targetLink = (input.targetLink ?? "").trim();
    if (!targetLink) {
      throw new HttpError(400, "target_link_required", "target_link is required for this product");
    }
    // product.sell_price (and correspondingly cost_price) is a rate PER 1000 units for
    // smm products.
    unitPrice = Number(product.sell_price) / 1000;
    unitCost = Number(product.cost_price) / 1000;
  }

  const totalPrice = Math.round(unitPrice * quantity * 10000) / 10000;
  const totalCost = Math.round(unitCost * quantity * 10000) / 10000;
  const orderId = crypto.randomUUID();
  const couponCode = input.couponCode?.trim();

  await db.transaction(async (trx) => {
    const wallet = await walletRepo.getWalletByUserId(userId, trx);
    if (!wallet) throw new HttpError(404, "not_found", "Wallet not found");

    // The order row has to exist before a coupon can be claimed — coupon_redemptions has
    // a foreign key on order_id. It's inserted here at the undiscounted price and then
    // corrected below once the discount is known, so the stored total_price is still
    // always the final, discounted amount actually charged by the time the transaction
    // commits — never a raw price a receipt or refund would then have to remember to adjust.
    await ordersRepo.insertPendingOrder(
      {
        id: orderId,
        userId,
        productId: product.id,
        kind: product.kind,
        quantity,
        targetLink,
        unitPrice: unitPrice.toFixed(4),
        totalPrice: totalPrice.toFixed(4),
        unitCost: unitCost.toFixed(4),
        totalCost: totalCost.toFixed(4),
        socialParams,
      },
      trx
    );

    let discountAmount = 0;
    if (couponCode) {
      const quote = await couponsService.applyCoupon(trx, userId, orderId, couponCode, totalPrice);
      discountAmount = quote.discountAmount;
    }
    const chargedPrice = Math.round((totalPrice - discountAmount) * 10000) / 10000;
    if (discountAmount > 0) {
      await ordersRepo.updateTotalPrice(orderId, chargedPrice.toFixed(4), trx);
    }

    const debitTx = await walletRepo.creditWallet(trx, {
      userId,
      walletId: wallet.id,
      amount: -chargedPrice,
      type: WALLET_TX_TYPES.ORDER_DEBIT,
      referenceType: WALLET_TX_REFERENCE_TYPES.ORDER,
      referenceId: orderId,
      idempotencyKey: `order:${orderId}:debit`,
      createdBy: null,
      note: null,
    });
    if (!debitTx) {
      // Fresh orderId => fresh idempotency key, this should be unreachable — defensive only.
      throw new Error(`Unexpected: order debit idempotency-key collision for order ${orderId}`);
    }

    await ordersRepo.markProcessing(orderId, debitTx.id, trx);
  });

  await fulfillOrder(
    orderId,
    userId,
    product,
    { quantity, targetLink, socialParams, totalPrice, productName: product.name },
    adapters
  );

  return (await ordersRepo.findById(orderId))!;
}

async function fulfillOrder(
  orderId: string,
  userId: string,
  product: { kind: "giftcard" | "smm" | "social_topup"; supplier_product_ref: string },
  details: {
    quantity: number;
    targetLink: string | null;
    socialParams: Record<string, string> | null;
    totalPrice: number;
    productName: string;
  },
  adapters: OrderAdapters
): Promise<void> {
  try {
    if (product.kind === "giftcard") {
      const redemption = await adapters.giftCard.purchase({ productId: product.supplier_product_ref });
      await ordersRepo.markCompleted(orderId, redemption, null);
      // Notifications are deliberately sent AFTER the order state is durable, and are
      // never awaited in a way that can fail the order — see notifications.service.ts.
      void notifications.notifyOrderCompleted(userId, details.productName, Boolean(redemption?.cardCode));
      void referralService.maybeRewardReferral(userId, orderId);
    } else if (product.kind === "social_topup") {
      const result = await adapters.social.purchase({
        productId: product.supplier_product_ref,
        quantity: details.quantity,
        params: details.socialParams!,
        orderUuid: orderId,
      });
      await ordersRepo.attachSupplierOrderRef(orderId, result.supplierOrderId, result);
      // Status stays 'processing' — live-app top-ups credit asynchronously on Libya Play's
      // side, see poll-social-orders.job.ts, which sends the completion/refund notification.
    } else {
      const result = await adapters.smm.addOrder({
        supplierServiceId: product.supplier_product_ref,
        link: details.targetLink!,
        quantity: details.quantity,
      });
      await ordersRepo.attachSupplierOrderRef(orderId, result.orderNumber, result);
      // Status stays 'processing' — SMM orders complete asynchronously, see
      // poll-smm-orders.job.ts, which sends the completion notification.
    }
  } catch (err) {
    if (err instanceof LibyaPlayApiError || err instanceof PlusApiError) {
      await refundAndFailOrder(orderId, userId, details.totalPrice, `supplier_error: ${err.message}`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      await ordersRepo.markAmbiguous(orderId, message);
      // Tell the customer their money is accounted for. Without this the wallet is
      // debited and nothing visibly happens, which reads exactly like being robbed.
      void notifications.notifyOrderUnderReview(userId);
    }
  }
}

/**
 * Refunds and marks failed — used both when a supplier call fails definitively (a
 * LibyaPlayApiError/PlusApiError response, above) and when an async supplier order later
 * resolves to a terminal rejection (see poll-social-orders.job.ts).
 */
export async function refundAndFailOrder(orderId: string, userId: string, amount: number, note: string): Promise<void> {
  await refundOrder(orderId, userId, amount, note);
  await ordersRepo.markFailed(orderId, note);
  void notifications.notifyOrderRefunded(userId, amount.toFixed(3));
}

/** Idempotent via the `order:{id}:refund` key — safe to call more than once (e.g. a manual admin retry). */
async function refundOrder(orderId: string, userId: string, amount: number, note: string): Promise<void> {
  await db.transaction(async (trx) => {
    const wallet = await walletRepo.getWalletByUserId(userId, trx);
    if (!wallet) return;

    const refundTx = await walletRepo.creditWallet(trx, {
      userId,
      walletId: wallet.id,
      amount,
      type: WALLET_TX_TYPES.REFUND,
      referenceType: WALLET_TX_REFERENCE_TYPES.ORDER,
      referenceId: orderId,
      idempotencyKey: `order:${orderId}:refund`,
      createdBy: null,
      note,
    });
    if (refundTx) {
      await ordersRepo.attachRefund(orderId, refundTx.id, trx);
    }
  });
}

export async function listMyOrders(userId: string, page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return ordersRepo.listByUser(userId, { limit, offset });
}

export async function getMyOrder(userId: string, orderId: string): Promise<OrderRow> {
  const order = await ordersRepo.findById(orderId);
  if (!order || order.user_id !== userId) {
    throw new HttpError(404, "not_found", "Order not found");
  }
  return order;
}

// --- Admin-facing operations (used by admin.service.ts) ---

export async function adminListByStatus(status: OrderStatus, page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return ordersRepo.listByStatus(status, { limit, offset });
}

/** Admin confirms (out-of-band, e.g. checked the supplier's own dashboard) that an ambiguous order actually succeeded. */
export async function adminMarkAmbiguousAsCompleted(orderId: string, note: string): Promise<OrderRow> {
  const order = await ordersRepo.findById(orderId);
  if (!order) throw new HttpError(404, "not_found", "Order not found");
  if (order.status !== ORDER_STATUS.AMBIGUOUS_ERROR) {
    throw new HttpError(409, "invalid_state", `Cannot resolve an order in status '${order.status}'`);
  }
  await ordersRepo.markCompleted(orderId, { adminNote: note, resolvedFrom: "ambiguous_error" }, order.supplier_order_ref);
  return (await ordersRepo.findById(orderId))!;
}

/** Admin confirms an ambiguous (or failed-but-unrefunded) order did NOT succeed on the supplier's side — refund it. */
export async function adminRefundOrder(orderId: string, note: string): Promise<OrderRow> {
  const order = await ordersRepo.findById(orderId);
  if (!order) throw new HttpError(404, "not_found", "Order not found");
  if (order.status !== ORDER_STATUS.AMBIGUOUS_ERROR && order.status !== ORDER_STATUS.FAILED) {
    throw new HttpError(409, "invalid_state", `Cannot refund an order in status '${order.status}'`);
  }
  await refundOrder(orderId, order.user_id, Number(order.total_price), note);
  await ordersRepo.setStatus(orderId, ORDER_STATUS.REFUNDED);
  return (await ordersRepo.findById(orderId))!;
}
