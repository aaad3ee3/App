import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { OrderRow, OrderStatus } from "../../db/types";

export interface InsertPendingOrderInput {
  id: string;
  userId: string;
  productId: string;
  kind: "giftcard" | "smm" | "social_topup";
  quantity: number;
  targetLink: string | null;
  unitPrice: string;
  totalPrice: string;
  socialParams?: Record<string, string> | null;
}

export async function insertPendingOrder(input: InsertPendingOrderInput, trx: Knex.Transaction): Promise<OrderRow> {
  const [row] = await trx<OrderRow>("orders")
    .insert({
      id: input.id,
      user_id: input.userId,
      product_id: input.productId,
      kind: input.kind,
      quantity: input.quantity,
      target_link: input.targetLink,
      unit_price: input.unitPrice,
      total_price: input.totalPrice,
      status: "pending",
      // See the analogous comment on products.required_params in catalog.repository.ts.
      social_params: (input.socialParams ? JSON.stringify(input.socialParams) : null) as unknown as Record<string, string> | null,
    })
    .returning("*");
  if (!row) throw new Error("Failed to insert order");
  return row;
}

/** Corrects the order's total after a coupon discount is applied — see orders.service.ts. */
export function updateTotalPrice(orderId: string, totalPrice: string, trx: Knex.Transaction): Promise<number> {
  return trx("orders").where({ id: orderId }).update({ total_price: totalPrice, updated_at: new Date() });
}

export function markProcessing(orderId: string, walletDebitTransactionId: string, trx: Knex.Transaction): Promise<number> {
  return trx("orders")
    .where({ id: orderId })
    .update({ status: "processing", wallet_debit_transaction_id: walletDebitTransactionId, updated_at: new Date() });
}

export function markCompleted(orderId: string, supplierResponse: unknown, supplierOrderRef: string | null): Promise<number> {
  return db("orders")
    .where({ id: orderId })
    .update({ status: "completed", supplier_response: supplierResponse, supplier_order_ref: supplierOrderRef, updated_at: new Date() });
}

/** SMM orders stay 'processing' after a successful addOrder call — they complete asynchronously, see poll-smm-orders.job.ts. */
export function attachSupplierOrderRef(orderId: string, supplierOrderRef: string, supplierResponse: unknown): Promise<number> {
  return db("orders")
    .where({ id: orderId })
    .update({ supplier_order_ref: supplierOrderRef, supplier_response: supplierResponse, updated_at: new Date() });
}

export function markFailed(orderId: string, errorMessage: string): Promise<number> {
  return db("orders").where({ id: orderId }).update({ status: "failed", error_message: errorMessage, updated_at: new Date() });
}

/** Supplier call's outcome is unknown (network failure) — see orders.service.ts for why this never auto-refunds. */
export function markAmbiguous(orderId: string, errorMessage: string): Promise<number> {
  return db("orders").where({ id: orderId }).update({ status: "ambiguous_error", error_message: errorMessage, updated_at: new Date() });
}

export function attachRefund(orderId: string, walletRefundTransactionId: string, trx: Knex | Knex.Transaction = db): Promise<number> {
  return trx("orders")
    .where({ id: orderId })
    .update({ wallet_refund_transaction_id: walletRefundTransactionId, updated_at: new Date() });
}

export function setStatus(orderId: string, status: OrderStatus, trx: Knex | Knex.Transaction = db): Promise<number> {
  return trx("orders").where({ id: orderId }).update({ status, updated_at: new Date() });
}

export function findById(id: string, trx: Knex | Knex.Transaction = db): Promise<OrderRow | undefined> {
  return trx<OrderRow>("orders").where({ id }).first();
}

export async function listByUser(
  userId: string,
  opts: { limit: number; offset: number }
): Promise<{ items: OrderRow[]; total: number }> {
  const [items, countRow] = await Promise.all([
    db<OrderRow>("orders").where({ user_id: userId }).orderBy("created_at", "desc").limit(opts.limit).offset(opts.offset),
    db<OrderRow>("orders").where({ user_id: userId }).count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}

export async function listByStatus(
  status: OrderStatus,
  opts: { limit: number; offset: number }
): Promise<{ items: OrderRow[]; total: number }> {
  const [items, countRow] = await Promise.all([
    db<OrderRow>("orders").where({ status }).orderBy("created_at", "desc").limit(opts.limit).offset(opts.offset),
    db<OrderRow>("orders").where({ status }).count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}

export function listProcessingSmmOrders(): Promise<OrderRow[]> {
  return db<OrderRow>("orders").where({ status: "processing", kind: "smm" }).whereNotNull("supplier_order_ref");
}

export function listProcessingSocialOrders(): Promise<OrderRow[]> {
  return db<OrderRow>("orders").where({ status: "processing", kind: "social_topup" }).whereNotNull("supplier_order_ref");
}
