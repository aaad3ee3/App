import * as notifications from "../modules/notifications/notifications.service";
import * as referralService from "../modules/referral/referral.service";
import { LibyaPlaySocialAdapter } from "../adapters/social/libyaplay-social.adapter";
import { refundAndFailOrder } from "../modules/orders/orders.service";
import * as ordersRepo from "../modules/orders/orders.repository";

export interface PollResult {
  checked: number;
  completed: number;
  refunded: number;
}

/**
 * Polls Libya Play's /social/order-and-status for every locally 'processing' live-app
 * top-up order and resolves it. Unlike Plus's free-text SMM status (see
 * poll-smm-orders.job.ts, which deliberately does NOT trust a keyword-classified failure
 * enough to auto-refund), Libya Play's own docs give a closed, authoritative status enum
 * for this endpoint — 'pending' | 'accept' | 'reject' | 'wait' — with 'reject' explicitly
 * meaning the order did not go through. That's the same confidence level the definitive-
 * supplier-error branch in orders.service.ts already auto-refunds on, so 'reject' is
 * handled the same way here rather than routed to the ambiguous-order admin queue.
 */
export async function pollSocialOrders(adapter: LibyaPlaySocialAdapter = new LibyaPlaySocialAdapter()): Promise<PollResult> {
  const orders = await ordersRepo.listProcessingSocialOrders();
  if (orders.length === 0) return { checked: 0, completed: 0, refunded: 0 };

  let statuses: Record<string, string>;
  try {
    statuses = await adapter.pollStatuses();
  } catch (err) {
    // Transient poll failure — leave every order 'processing' and retry next tick. No
    // money is at risk here: each order was already accepted by Libya Play before polling started.
    // eslint-disable-next-line no-console
    console.error("[poll-social-orders] failed to fetch order-and-status:", err);
    return { checked: orders.length, completed: 0, refunded: 0 };
  }

  let completed = 0;
  let refunded = 0;

  for (const order of orders) {
    const status = statuses[order.supplier_order_ref!];
    if (!status) continue; // Not in the response yet — leave 'processing', retry next tick.

    if (status === "accept") {
      await ordersRepo.markCompleted(order.id, { social_status: status }, order.supplier_order_ref);
      // A live-app top-up can take a while to credit — without a push the customer has to
      // keep reopening the app to check.
      void notifications.notifyOrderCompleted(order.user_id, "طلبك", false);
      void referralService.maybeRewardReferral(order.user_id, order.id);
      completed += 1;
    } else if (status === "reject") {
      await refundAndFailOrder(order.id, order.user_id, Number(order.total_price), `Libya Play rejected the social order (status: "${status}")`);
      refunded += 1;
    }
    // 'pending' / 'wait' — still in flight, no-op.
  }

  return { checked: orders.length, completed, refunded };
}

export function startPollSocialOrdersJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    pollSocialOrders().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[poll-social-orders.job] sweep failed:", err);
    });
  }, intervalMs);
}
