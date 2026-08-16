import crypto from "node:crypto";
import { db } from "../../db/knex";
import { ORDER_STATUS, WALLET_TX_REFERENCE_TYPES, WALLET_TX_TYPES } from "../../config/constants";
import { HttpError } from "../../plugins/error-handler.plugin";
import type { OrderRow, OrderStatus } from "../../db/types";
import { LibyaPlayAdapter } from "../../adapters/giftcards/libyaplay.adapter";
import { LibyaPlayApiError } from "../../adapters/giftcards/libyaplay.client";
import type { GiftCardSupplierAdapter } from "../../adapters/giftcards/giftcard-supplier.interface";
import { PlusAdapter } from "../../adapters/smm/plus.adapter";
import { PlusApiError } from "../../adapters/smm/plus.client";
import type { SmmSupplierAdapter } from "../../adapters/smm/smm-supplier.interface";
import * as catalogRepo from "../catalog/catalog.repository";
import * as walletRepo from "../wallet/wallet.repository";
import * as notifications from "../notifications/notifications.service";
import * as ordersRepo from "./orders.repository";

export interface OrderAdapters {
  giftCard: GiftCardSupplierAdapter;
  smm: SmmSupplierAdapter;
}

function defaultAdapters(): OrderAdapters {
  return { giftCard: new LibyaPlayAdapter(), smm: new PlusAdapter() };
}

export interface CreateOrderInput {
  productId: string;
  /** Required for smm products; ignored for giftcard (always exactly 1 unit — Libya Play's pay endpoint has no quantity param). */
  quantity?: number;
  /** Required for smm products (the URL/username to deliver to); must be absent for giftcard. */
  targetLink?: string;
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

  let quantity: number;
  let targetLink: string | null;
  let unitPrice: number;

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
    // product.sell_price is a rate PER 1000 units for smm products.
    unitPrice = Number(product.sell_price) / 1000;
  }

  const totalPrice = Math.round(unitPrice * quantity * 10000) / 10000;
  const orderId = crypto.randomUUID();

  await db.transaction(async (trx) => {
    const wallet = await walletRepo.getWalletByUserId(userId, trx);
    if (!wallet) throw new HttpError(404, "not_found", "Wallet not found");

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
      },
      trx
    );

    const debitTx = await walletRepo.creditWallet(trx, {
      userId,
      walletId: wallet.id,
      amount: -totalPrice,
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

  await fulfillOrder(orderId, userId, product, { quantity, targetLink, totalPrice, productName: product.name }, adapters);

  return (await ordersRepo.findById(orderId))!;
}

async function fulfillOrder(
  orderId: string,
  userId: string,
  product: { kind: "giftcard" | "smm"; supplier_product_ref: string },
  details: { quantity: number; targetLink: string | null; totalPrice: number; productName: string },
  adapters: OrderAdapters
): Promise<void> {
  try {
    if (product.kind === "giftcard") {
      const redemption = await adapters.giftCard.purchase({ productId: product.supplier_product_ref });
      await ordersRepo.markCompleted(orderId, redemption, null);
      // Notifications are deliberately sent AFTER the order state is durable, and are
      // never awaited in a way that can fail the order — see notifications.service.ts.
      void notifications.notifyOrderCompleted(userId, details.productName, Boolean(redemption?.cardCode));
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
      await refundOrder(orderId, userId, details.totalPrice, `supplier_error: ${err.message}`);
      await ordersRepo.markFailed(orderId, err.message);
      void notifications.notifyOrderRefunded(userId, details.totalPrice.toFixed(3));
    } else {
      const message = err instanceof Error ? err.message : String(err);
      await ordersRepo.markAmbiguous(orderId, message);
      // Tell the customer their money is accounted for. Without this the wallet is
      // debited and nothing visibly happens, which reads exactly like being robbed.
      void notifications.notifyOrderUnderReview(userId);
    }
  }
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
