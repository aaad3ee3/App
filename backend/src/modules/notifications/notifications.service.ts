import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../../config/env";
import * as repo from "./notifications.repository";

/**
 * Push notifications via Firebase Cloud Messaging.
 *
 * Two rules shape this module:
 *
 * 1. **Never let a notification failure affect money.** Sending is always best-effort and
 *    fire-and-forget: an order is completed and a wallet is credited whether or not the
 *    push goes out. A caller must never `await` this in a way that can fail its own
 *    transaction — see `notifyUser`, which swallows everything.
 *
 * 2. **Work with no Firebase configured.** Local development and the test suite have no
 *    credentials, so an unconfigured app silently no-ops rather than throwing.
 */

let firebaseApp: App | null = null;
let initialised = false;

function getFirebase(): App | null {
  if (initialised) return firebaseApp;
  initialised = true;

  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
    // eslint-disable-next-line no-console
    console.info("[notifications] FCM not configured — push notifications are disabled");
    return null;
  }

  try {
    const existing = getApps();
    firebaseApp =
      existing.length > 0
        ? existing[0]!
        : initializeApp({
            credential: cert({
              projectId: env.FCM_PROJECT_ID,
              clientEmail: env.FCM_CLIENT_EMAIL,
              // .env files cannot hold real newlines, so the key is stored with literal
              // \n sequences and restored here.
              privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
            }),
          });
    return firebaseApp;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] failed to initialise Firebase:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface PushMessage {
  title: string;
  body: string;
  /** Values must be strings — FCM rejects a data payload containing anything else. */
  data?: Record<string, string>;
}

/**
 * Sends to every device registered to a user. Resolves to the number delivered.
 *
 * Never throws. Callers sit on paths that move money, and a dead Firebase project or a
 * network blip must not turn a completed order into a failed one.
 */
export async function notifyUser(userId: string, message: PushMessage): Promise<number> {
  try {
    const app = getFirebase();
    if (!app) return 0;

    const tokens = await repo.listTokensForUser(userId);
    if (tokens.length === 0) return 0;

    const response = await getMessaging(app).sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: { priority: "high", notification: { sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
    });

    // FCM reports per-token failures. Tokens rejected as unregistered/invalid belong to
    // uninstalled apps and will never work again, so drop them instead of retrying them
    // on every future send.
    const dead: string[] = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code ?? "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
        const token = tokens[index]?.token;
        if (token) dead.push(token);
      }
    });
    if (dead.length > 0) await repo.deleteTokens(dead);

    return response.successCount;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] send failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

// --- Message templates -------------------------------------------------------------
// Kept here so the wording stays consistent and translatable in one place, and so the
// call sites read as intent ("tell them the order is done") rather than string building.

export function notifyOrderCompleted(userId: string, productName: string, hasCode: boolean): Promise<number> {
  return notifyUser(userId, {
    title: "تم تنفيذ طلبك ✅",
    body: hasCode ? `${productName} — الكود جاهز، افتح "طلباتي" لعرضه` : `${productName} — تم التنفيذ بنجاح`,
    data: { type: "order_completed" },
  });
}

export function notifyOrderRefunded(userId: string, amount: string): Promise<number> {
  return notifyUser(userId, {
    title: "تم استرجاع مبلغ طلبك",
    body: `رجّعنا ${amount} د.ل إلى محفظتك بعد تعذّر تنفيذ الطلب`,
    data: { type: "order_refunded" },
  });
}

export function notifyOrderUnderReview(userId: string): Promise<number> {
  return notifyUser(userId, {
    title: "طلبك قيد المراجعة",
    body: "نتأكد من حالة طلبك مع المورد وسنحدّثك قريباً",
    data: { type: "order_under_review" },
  });
}

export function notifyWalletCredited(userId: string, amount: string, newBalance: string): Promise<number> {
  return notifyUser(userId, {
    title: "تم شحن رصيدك 💰",
    body: `أضفنا ${amount} د.ل — رصيدك الآن ${newBalance} د.ل`,
    data: { type: "wallet_credited" },
  });
}
