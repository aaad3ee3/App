import * as notifications from "../modules/notifications/notifications.service";
import { PlusAdapter } from "../adapters/smm/plus.adapter";
import { PlusApiError } from "../adapters/smm/plus.client";
import * as ordersRepo from "../modules/orders/orders.repository";

// Plus's docs only confirm one status string ("In progress") — no full enum. Classify by
// keyword rather than an exhaustive match so an unrecognized status (which WILL happen —
// "wait", "pending", "partial" etc. are plausible but unconfirmed) safely stays
// 'processing' instead of being silently misfiled as done or failed.
const TERMINAL_SUCCESS_KEYWORDS = ["complete", "completed", "done", "finished"];
const TERMINAL_FAILURE_KEYWORDS = ["reject", "cancel", "fail"];

function classifyStatus(rawStatus: string): "completed" | "failed" | "processing" {
  const lower = rawStatus.toLowerCase();
  if (TERMINAL_SUCCESS_KEYWORDS.some((k) => lower.includes(k))) return "completed";
  if (TERMINAL_FAILURE_KEYWORDS.some((k) => lower.includes(k))) return "failed";
  return "processing";
}

export interface PollResult {
  checked: number;
  completed: number;
  flaggedFailed: number;
}

/**
 * Polls Plus for every locally 'processing' SMM order and refreshes its status. Terminal
 * failure reported by Plus (rejected/cancelled) does NOT auto-refund here — the order was
 * already accepted (debited) and Plus's status endpoint alone can't tell us whether
 * partial delivery happened before it failed, so it's routed to the ambiguous-order admin
 * queue instead (see orders.service.ts's ambiguous-error handling for the same reasoning
 * applied to the initial purchase call).
 */
export async function pollSmmOrders(adapter: PlusAdapter = new PlusAdapter()): Promise<PollResult> {
  const orders = await ordersRepo.listProcessingSmmOrders();
  let completed = 0;
  let flaggedFailed = 0;

  for (const order of orders) {
    if (!order.supplier_order_ref) continue;
    try {
      const status = await adapter.getOrderStatus(order.supplier_order_ref);
      const classification = classifyStatus(status.status);

      if (classification === "completed") {
        await ordersRepo.markCompleted(order.id, status, order.supplier_order_ref);
        // This is the moment the customer has been waiting for — an SMM order can take
        // hours, so without a push they have to keep reopening the app to check.
        void notifications.notifyOrderCompleted(order.user_id, "طلبك", false);
        completed += 1;
      } else if (classification === "failed") {
        await ordersRepo.markAmbiguous(order.id, `Plus reported a terminal failure status: "${status.status}"`);
        void notifications.notifyOrderUnderReview(order.user_id);
        flaggedFailed += 1;
      } else {
        await ordersRepo.attachSupplierOrderRef(order.id, order.supplier_order_ref, status);
      }
    } catch (err) {
      // Transient poll failure — leave it 'processing' and retry next tick. No money is at
      // risk here: the order was already debited and accepted by Plus before polling started.
      // eslint-disable-next-line no-console
      console.error(`[poll-smm-orders] failed to poll order ${order.id}:`, err instanceof PlusApiError ? err.body : err);
    }
  }

  return { checked: orders.length, completed, flaggedFailed };
}

export function startPollSmmOrdersJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    pollSmmOrders().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[poll-smm-orders.job] sweep failed:", err);
    });
  }, intervalMs);
}
