import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { AdminActionRow, UserRow, WalletRow } from "../../db/types";

export function logAction(
  input: { adminUserId: string; action: string; targetType: AdminActionRow["target_type"]; targetId: string; details?: unknown },
  trx: Knex | Knex.Transaction = db
): Promise<void> {
  return trx("admin_actions").insert({
    admin_user_id: input.adminUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    details: input.details ?? null,
  });
}

export async function listUsers(opts: { limit: number; offset: number }): Promise<{
  items: (Pick<UserRow, "id" | "email" | "phone" | "full_name" | "is_admin" | "status" | "created_at"> & {
    balance: string | null;
  })[];
  total: number;
}> {
  const [items, countRow] = await Promise.all([
    db<UserRow>("users")
      .leftJoin("wallets", "wallets.user_id", "users.id")
      .orderBy("users.created_at", "desc")
      .limit(opts.limit)
      .offset(opts.offset)
      .select(
        "users.id",
        "users.email",
        "users.phone",
        "users.full_name",
        "users.is_admin",
        "users.status",
        "users.created_at",
        "wallets.balance"
      ),
    db<UserRow>("users").count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}

export async function getUserDetail(userId: string) {
  const row = await db<UserRow>("users")
    .leftJoin("wallets", "wallets.user_id", "users.id")
    .where("users.id", userId)
    .select(
      "users.id",
      "users.email",
      "users.phone",
      "users.full_name",
      "users.is_admin",
      "users.status",
      "users.failed_login_attempts",
      "users.locked_until",
      "users.created_at",
      "wallets.balance",
      "wallets.currency"
    )
    .first<
      (Pick<
        UserRow,
        "id" | "email" | "phone" | "full_name" | "is_admin" | "status" | "failed_login_attempts" | "locked_until" | "created_at"
      > &
        Pick<WalletRow, "balance" | "currency">) | undefined
    >();
  return row;
}

// --- Analytics ---

/** Orders whose money is currently ours to count: collected and not yet given back.
 *  'pending' is excluded defensively (createOrder moves an order to 'processing' inside
 *  the same transaction that debits the wallet, so a row should never be visibly 'pending'
 *  from outside it) — 'failed' and 'refunded' are excluded because that money already went
 *  back to the customer. */
const REVENUE_STATUSES = ["processing", "completed", "ambiguous_error"] as const;

export interface RevenueByKindRow {
  kind: string;
  revenue_today: string;
  profit_today: string;
  revenue_month: string;
  profit_month: string;
  revenue_year: string;
  profit_year: string;
  order_count_today: string;
  order_count_month: string;
  order_count_year: string;
}

/**
 * One query, three period cutoffs via conditional aggregation rather than three round
 * trips. Profit is `total_price - total_cost` — both snapshotted at order time (see the
 * migration that added total_cost) — so a later change to the markup percent or a
 * supplier's price never silently rewrites a past order's recorded profit.
 *
 * Boundaries are plain UTC day/month/year starts, not Libya's own UTC+2 — good enough for
 * a dashboard stat, off by at most 2 hours right at a boundary, not worth a timezone
 * library dependency for.
 */
export async function getRevenueByKind(now: Date): Promise<RevenueByKindRow[]> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const result = await db.raw<{ rows: RevenueByKindRow[] }>(
    `SELECT
       o.kind,
       COALESCE(SUM(o.total_price) FILTER (WHERE o.created_at >= ?), 0) AS revenue_today,
       COALESCE(SUM(o.total_price - COALESCE(o.total_cost, 0)) FILTER (WHERE o.created_at >= ?), 0) AS profit_today,
       COALESCE(SUM(o.total_price) FILTER (WHERE o.created_at >= ?), 0) AS revenue_month,
       COALESCE(SUM(o.total_price - COALESCE(o.total_cost, 0)) FILTER (WHERE o.created_at >= ?), 0) AS profit_month,
       COALESCE(SUM(o.total_price) FILTER (WHERE o.created_at >= ?), 0) AS revenue_year,
       COALESCE(SUM(o.total_price - COALESCE(o.total_cost, 0)) FILTER (WHERE o.created_at >= ?), 0) AS profit_year,
       COUNT(*) FILTER (WHERE o.created_at >= ?) AS order_count_today,
       COUNT(*) FILTER (WHERE o.created_at >= ?) AS order_count_month,
       COUNT(*) FILTER (WHERE o.created_at >= ?) AS order_count_year
     FROM orders o
     WHERE o.status = ANY(?)
     GROUP BY o.kind`,
    [
      startOfToday, startOfToday,
      startOfMonth, startOfMonth,
      startOfYear, startOfYear,
      startOfToday, startOfMonth, startOfYear,
      REVENUE_STATUSES as unknown as string[],
    ]
  );
  return result.rows;
}

export interface UserCounts {
  today: string;
  month: string;
  year: string;
}

export async function getNewUserCounts(now: Date): Promise<UserCounts> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const result = await db.raw<{ rows: UserCounts[] }>(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= ?) AS today,
       COUNT(*) FILTER (WHERE created_at >= ?) AS month,
       COUNT(*) FILTER (WHERE created_at >= ?) AS year
     FROM users`,
    [startOfToday, startOfMonth, startOfYear]
  );
  return result.rows[0] ?? { today: "0", month: "0", year: "0" };
}

export interface TopProductRow {
  id: string;
  name: string;
  kind: string;
  order_count: string;
  revenue: string;
}

export interface OrderIssueRow {
  id: string;
  status: string;
  kind: string;
  total_price: string;
  error_message: string | null;
  created_at: Date;
}

/** Feeds the admin alerts page — a failed order already had its money refunded
 *  automatically (see refundAndFailOrder in orders.service.ts) so it's purely
 *  informational; an ambiguous_error one is still awaiting a manual admin decision. */
export function listRecentOrderIssues(limit: number): Promise<OrderIssueRow[]> {
  return db("orders")
    .whereIn("status", ["failed", "ambiguous_error"])
    .orderBy("created_at", "desc")
    .limit(limit)
    .select("id", "status", "kind", "total_price", "error_message", "created_at");
}

/** All-time top sellers by order count — not scoped to "completed" only, same reasoning
 *  as REVENUE_STATUSES: an order still processing or under manual review already
 *  represents a real customer request for that product. */
export async function getTopProducts(limit: number): Promise<TopProductRow[]> {
  const result = await db.raw<{ rows: TopProductRow[] }>(
    `SELECT p.id, p.name, p.kind, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_price), 0) AS revenue
     FROM orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.status = ANY(?)
     GROUP BY p.id, p.name, p.kind
     ORDER BY order_count DESC
     LIMIT ?`,
    [REVENUE_STATUSES as unknown as string[], limit]
  );
  return result.rows;
}
