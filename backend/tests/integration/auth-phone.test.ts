import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { db } from "../../src/db/knex";
import { setSmsSenderForTesting, type SmsSender } from "../../src/lib/sms-sender";
import { createTestCategory, createTestProduct, createTestSession, createTestUser, creditTestWallet, resetDb } from "../helpers";

/**
 * Covers the launch-blocking auth work: phone identity, Libyana-only numbers, password
 * reset, and account deletion.
 */
describe("phone auth", () => {
  let app: FastifyInstance;
  let sent: { to: string; text: string }[] = [];

  const capturingSender: SmsSender = {
    async send(to, text) {
      sent.push({ to, text });
    },
  };

  /** Codes are only ever stored hashed, so tests read them out of the SMS text. */
  const lastCode = () => sent.at(-1)!.text.match(/(\d{6})/)![1]!;

  beforeEach(async () => {
    await resetDb();
    await db("phone_verifications").del();
    sent = [];
    setSmsSenderForTesting(capturingSender);
    if (!app) {
      app = buildApp();
      await app.ready();
    }
  });

  afterAll(async () => {
    setSmsSenderForTesting(null);
    await app?.close();
    await db.destroy();
  });

  const post = (url: string, payload: unknown, token?: string) =>
    app.inject({
      method: "POST",
      url,
      payload: payload as object,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  async function registerUser(phone = "0912345678", password = "correct-horse-battery") {
    await post("/api/v1/auth/register/start", { phone });
    const res = await post("/api/v1/auth/register/complete", {
      phone,
      code: lastCode(),
      password,
      full_name: "زبون تجريبي",
    });
    return res;
  }

  describe("Libyana-only numbers", () => {
    it("accepts Libyana prefixes in any format the customer might type", async () => {
      for (const input of ["0912345678", "+218912345678", "00218 92 345 6789".replace(/\s/g, ""), "0923456789"]) {
        const res = await post("/api/v1/auth/register/start", { phone: input });
        expect(res.statusCode, `${input} should be accepted`).toBe(202);
      }
    });

    it("rejects Al-Madar numbers outright", async () => {
      // Al-Madar can neither fund a wallet via the Libyana transfer flow nor receive our
      // codes, so an account on one of these numbers could never be topped up or recovered.
      for (const madar of ["0945678901", "0955678901", "+218945678901"]) {
        const res = await post("/api/v1/auth/register/start", { phone: madar });
        expect(res.statusCode, `${madar} must be rejected`).toBe(400);
      }
    });

    it("rejects nonsense numbers", async () => {
      for (const bad of ["123", "0812345678", "abcdefghij", ""]) {
        const res = await post("/api/v1/auth/register/start", { phone: bad });
        expect(res.statusCode).toBe(400);
      }
    });
  });

  describe("registration", () => {
    it("sends a code and creates the account once it is verified", async () => {
      const res = await registerUser();

      expect(res.statusCode).toBe(201);
      expect(res.json().user.phone).toBe("0912345678");
      expect(res.json().token).toBeTruthy();

      const user = await db("users").where({ phone: "0912345678" }).first();
      expect(user.phone_verified_at).not.toBeNull();
    });

    it("refuses a wrong code, and locks the code out after repeated attempts", async () => {
      await post("/api/v1/auth/register/start", { phone: "0912345678" });

      for (let i = 0; i < 5; i += 1) {
        const bad = await post("/api/v1/auth/register/complete", {
          phone: "0912345678",
          code: "000000",
          password: "correct-horse-battery",
        });
        expect(bad.statusCode).toBe(400);
      }

      // The real code must now be dead too — otherwise the attempt limit is decorative.
      const res = await post("/api/v1/auth/register/complete", {
        phone: "0912345678",
        code: lastCode(),
        password: "correct-horse-battery",
      });
      expect(res.statusCode).toBe(400);
    });

    it("does not reveal that a number is already registered", async () => {
      await registerUser();
      sent = [];

      const res = await post("/api/v1/auth/register/start", { phone: "0912345678" });

      // Same 202 as an unregistered number, and no code sent to someone else's handset.
      expect(res.statusCode).toBe(202);
      expect(sent).toHaveLength(0);
    });

    it("requires a password long enough to be worth having", async () => {
      await post("/api/v1/auth/register/start", { phone: "0912345678" });
      const res = await post("/api/v1/auth/register/complete", {
        phone: "0912345678",
        code: lastCode(),
        password: "short",
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("login", () => {
    it("signs in with the phone number", async () => {
      await registerUser();
      const res = await post("/api/v1/auth/login", {
        phone: "0912345678",
        password: "correct-horse-battery",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().token).toBeTruthy();
    });

    it("rejects a wrong password", async () => {
      await registerUser();
      const res = await post("/api/v1/auth/login", { phone: "0912345678", password: "wrong-password-here" });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("password reset", () => {
    it("lets a customer who forgot their password back in", async () => {
      await registerUser();
      sent = [];

      const requested = await post("/api/v1/auth/password-reset/request", { phone: "0912345678" });
      expect(requested.statusCode).toBe(202);
      expect(sent).toHaveLength(1);

      const reset = await post("/api/v1/auth/password-reset/complete", {
        phone: "0912345678",
        code: lastCode(),
        password: "a-brand-new-password",
      });
      expect(reset.statusCode).toBe(200);

      const login = await post("/api/v1/auth/login", {
        phone: "0912345678",
        password: "a-brand-new-password",
      });
      expect(login.statusCode).toBe(200);
    });

    it("revokes existing sessions, so a thief's session dies with the reset", async () => {
      const registered = await registerUser();
      const stolenToken = registered.json().token;

      // The stolen session works right up until the reset.
      const before = await app.inject({
        method: "GET",
        url: "/api/v1/wallet",
        headers: { authorization: `Bearer ${stolenToken}` },
      });
      expect(before.statusCode).toBe(200);

      sent = [];
      await post("/api/v1/auth/password-reset/request", { phone: "0912345678" });
      await post("/api/v1/auth/password-reset/complete", {
        phone: "0912345678",
        code: lastCode(),
        password: "a-brand-new-password",
      });

      const after = await app.inject({
        method: "GET",
        url: "/api/v1/wallet",
        headers: { authorization: `Bearer ${stolenToken}` },
      });
      expect(after.statusCode).toBe(401);
    });

    it("stays silent about unregistered numbers", async () => {
      sent = [];
      const res = await post("/api/v1/auth/password-reset/request", { phone: "0919999999" });

      expect(res.statusCode).toBe(202);
      expect(sent).toHaveLength(0);
    });

    it("never stores the code in the clear", async () => {
      await registerUser();
      sent = [];
      await post("/api/v1/auth/password-reset/request", { phone: "0912345678" });

      const row = await db("phone_verifications").where({ purpose: "reset" }).first();
      expect(row.code_hash).not.toContain(lastCode());
      expect(row.code_hash).toHaveLength(64);
    });
  });

  describe("account deletion", () => {
    it("anonymizes the account and frees the number for re-registration", async () => {
      const registered = await registerUser();
      const token = registered.json().token;

      const res = await post("/api/v1/auth/delete-account", { password: "correct-horse-battery" }, token);
      expect(res.statusCode).toBe(200);

      const user = await db("users").where({ status: "deleted" }).first();
      expect(user.phone).toBeNull();
      expect(user.email).toBeNull();
      expect(user.full_name).toBeNull();

      // The session must die with the account.
      const after = await app.inject({
        method: "GET",
        url: "/api/v1/wallet",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(after.statusCode).toBe(401);

      // And the number is usable again by its next owner.
      const reused = await post("/api/v1/auth/register/start", { phone: "0912345678" });
      expect(reused.statusCode).toBe(202);
    });

    it("refuses while the wallet still holds money", async () => {
      const registered = await registerUser();
      const token = registered.json().token;
      const user = await db("users").where({ phone: "0912345678" }).first();
      const wallet = await db("wallets").where({ user_id: user.id }).first();
      await creditTestWallet(user.id, wallet.id, 25);

      const res = await post("/api/v1/auth/delete-account", { password: "correct-horse-battery" }, token);

      // Deleting here would destroy the customer's funds.
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("wallet_not_empty");
    });

    it("refuses while an order is still unsettled", async () => {
      const registered = await registerUser();
      const token = registered.json().token;
      const user = await db("users").where({ phone: "0912345678" }).first();

      const category = await createTestCategory({ kind: "giftcard" });
      const product = await createTestProduct(category.id, { kind: "giftcard", sellPrice: 5 });
      await db("orders").insert({
        user_id: user.id,
        product_id: product.id,
        kind: "giftcard",
        quantity: 1,
        unit_price: 5,
        total_price: 5,
        // Money committed, outcome still unknown — an admin has to settle it.
        status: "ambiguous_error",
      });

      const res = await post("/api/v1/auth/delete-account", { password: "correct-horse-battery" }, token);

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("orders_in_flight");
    });

    it("requires the password, so a borrowed unlocked phone is not enough", async () => {
      const { user } = await createTestUser({ email: "reauth@example.com" });
      const token = await createTestSession(user.id);

      const res = await post("/api/v1/auth/delete-account", { password: "not-the-password" }, token);

      expect(res.statusCode).toBe(401);
    });
  });
});
