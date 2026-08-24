import { db } from "../db/knex";
import { env } from "../config/env";
import * as notifications from "../modules/notifications/notifications.service";

/**
 * Nudges customers who have gone quiet: registered a while ago, own at least one device
 * token, and have no completed order within `REENGAGEMENT_INACTIVE_DAYS` — but only once
 * per `REENGAGEMENT_MIN_GAP_DAYS`, tracked on `users.last_reengagement_push_at`, so this
 * pings someone at most once a week rather than on every tick.
 *
 * The timestamp is updated whether or not FCM actually delivered anything — a user whose
 * only device tokens are dead should still be left alone for the gap period rather than
 * re-queried (and re-sent-to, uselessly) every run.
 */
export async function sendReengagementPushes(): Promise<number> {
  const result = await db.raw<{ rows: { id: string }[] }>(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN device_tokens dt ON dt.user_id = u.id
     WHERE u.status = 'active'
       AND u.created_at < now() - (? || ' days')::interval
       AND (u.last_reengagement_push_at IS NULL OR u.last_reengagement_push_at < now() - (? || ' days')::interval)
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.user_id = u.id AND o.status = 'completed' AND o.created_at > now() - (? || ' days')::interval
       )`,
    [env.REENGAGEMENT_INACTIVE_DAYS, env.REENGAGEMENT_MIN_GAP_DAYS, env.REENGAGEMENT_INACTIVE_DAYS]
  );

  let delivered = 0;
  for (const row of result.rows) {
    const count = await notifications.notifyUser(row.id, {
      title: "وحشتنا 👋",
      body: "شوف آخر البطاقات والعروض الجديدة في سايح",
      data: { type: "re_engagement" },
    });
    await db("users").where({ id: row.id }).update({ last_reengagement_push_at: new Date() });
    if (count > 0) delivered += 1;
  }
  return delivered;
}

export function startReengagementPushJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    sendReengagementPushes().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[reengagement-push.job] failed:", err);
    });
  }, intervalMs);
}
