import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db/knex";
import * as notifications from "../../src/modules/notifications/notifications.service";
import * as repo from "../../src/modules/notifications/notifications.repository";
import { createOrder } from "../../src/modules/orders/orders.service";
import { processIncomingSms } from "../../src/modules/sms/sms.matcher";
import {
  createPendingTopup,
  createTestCategory,
  createTestProduct,
  createTestUser,
  creditTestWallet,
  resetDb,
} from "../helpers";

/**
 * Verifies notifications fire at the right moments, and — more importantly — that they
 * can never damage the thing they are reporting on. A push is a courtesy; a debited
 * wallet is not.
 */
describe("notifications", () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe("device token registration", () => {
    it("moves a token to the new user when a device changes hands", async () => {
      const first = await createTestUser({ email: "first-owner@example.com" });
      const second = await createTestUser({ email: "second-owner@example.com" });

      await repo.upsertDeviceToken({ userId: first.user.id, token: "device-token-abc-123456", platform: "android" });
      await repo.upsertDeviceToken({ userId: second.user.id, token: "device-token-abc-123456", platform: "android" });

      // If the token were duplicated rather than moved, the previous owner would keep
      // receiving notifications naming the new owner's order amounts and card codes.
      expect(await repo.listTokensForUser(first.user.id)).toHaveLength(0);
      expect(await repo.listTokensForUser(second.user.id)).toHaveLength(1);
    });

    it("removes a token on request", async () => {
      const { user } = await createTestUser({ email: "signout@example.com" });
      await repo.upsertDeviceToken({ userId: user.id, token: "token-to-remove-987654", platform: "ios" });

      await repo.deleteTokenForUser(user.id, "token-to-remove-987654");

      expect(await repo.listTokensForUser(user.id)).toHaveLength(0);
    });
  });

  describe("order events", () => {
    it("notifies on a completed gift card purchase", async () => {
      const spy = vi.spyOn(notifications, "notifyOrderCompleted").mockResolvedValue(1);

      const { user, wallet } = await createTestUser({ email: "buyer@example.com" });
      await creditTestWallet(user.id, wallet.id, 500);
      const category = await createTestCategory({ kind: "giftcard" });
      const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10, name: "بطاقة تجريبية" });

      await createOrder(
        user.id,
        { productId: product.id },
        {
          giftCard: { purchase: async () => ({ cardCode: "CODE-123", raw: {} }) } as never,
          smm: {} as never,
        }
      );

      expect(spy).toHaveBeenCalledWith(user.id, "بطاقة تجريبية", true);
    });

    it("notifies about review — not silence — when the supplier outcome is unknown", async () => {
      const spy = vi.spyOn(notifications, "notifyOrderUnderReview").mockResolvedValue(1);

      const { user, wallet } = await createTestUser({ email: "ambiguous@example.com" });
      await creditTestWallet(user.id, wallet.id, 500);
      const category = await createTestCategory({ kind: "giftcard" });
      const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10 });

      await createOrder(
        user.id,
        { productId: product.id },
        {
          // A bare network failure: we cannot tell whether the supplier fulfilled it.
          giftCard: {
            purchase: async () => {
              throw new Error("socket hang up");
            },
          } as never,
          smm: {} as never,
        }
      );

      // Without this the wallet is debited and nothing visibly happens, which to a
      // customer is indistinguishable from being robbed.
      expect(spy).toHaveBeenCalledWith(user.id);
    });

    it("still completes the order when sending the notification throws", async () => {
      vi.spyOn(notifications, "notifyOrderCompleted").mockRejectedValue(new Error("FCM is down"));

      const { user, wallet } = await createTestUser({ email: "push-fails@example.com" });
      await creditTestWallet(user.id, wallet.id, 500);
      const category = await createTestCategory({ kind: "giftcard" });
      const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 10 });

      const order = await createOrder(
        user.id,
        { productId: product.id },
        {
          giftCard: { purchase: async () => ({ cardCode: "CODE-XYZ", raw: {} }) } as never,
          smm: {} as never,
        }
      );

      // The push is a courtesy; the purchase is the product.
      expect(order.status).toBe("completed");
    });
  });

  describe("wallet events", () => {
    it("notifies once a top-up SMS credits the wallet", async () => {
      const spy = vi.spyOn(notifications, "notifyWalletCredited").mockResolvedValue(1);

      const { user } = await createTestUser({ email: "topup-push@example.com" });
      await createPendingTopup({ userId: user.id, senderPhone: "0921112233", requestedAmount: 50 });

      await processIncomingSms({
        rawText: "تم تحويل 50 دينار من الرقم 0921112233 إلى رصيدك بنجاح",
        reportedSender: "Libyana",
        rawPayload: {},
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[0]).toBe(user.id);
    });

    it("does not notify when the SMS matches nothing", async () => {
      const spy = vi.spyOn(notifications, "notifyWalletCredited").mockResolvedValue(1);

      await processIncomingSms({
        rawText: "تم تحويل 50 دينار من الرقم 0929999999 إلى رصيدك بنجاح",
        reportedSender: "Libyana",
        rawPayload: {},
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("when FCM is not configured", () => {
    it("reports zero sends rather than throwing", async () => {
      const { user } = await createTestUser({ email: "no-fcm@example.com" });
      await repo.upsertDeviceToken({ userId: user.id, token: "some-token-1234567890", platform: "android" });

      // No FCM_* env vars in the test environment, so this exercises the disabled path.
      await expect(notifications.notifyUser(user.id, { title: "t", body: "b" })).resolves.toBe(0);
    });
  });
});
