import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { db } from "../../src/db/knex";
import { setSmsSenderForTesting, type SmsSender } from "../../src/lib/sms-sender";
import { createTestCategory, createTestProduct, createTestSession, createTestUser, creditTestWallet, resetDb } from "../helpers";

/**
 * Covers the launch-blocking auth work: email registration, phone linking (which is
 * where Libyana-only validation now lives), password reset, and account deletion.
 */
describe("auth", () => {
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

  async function registerUser(email = "customer@example.com", password = "correct-horse-battery") {
    return post("/api/v1/auth/register", {
      email,
      password,
      confirm_password: password,
      full_name: "زبون تجريبي",
    });
  }

  describe("registration", () => {
    it("creates the account and signs in, no SMS involved", async () => {
      const res = await registerUser();

      expect(res.statusCode).toBe(201);
      expect(res.json().user.email).toBe("customer@example.com");
      expect(res.json().user.phone).toBeNull();
      expect(res.json().token).toBeTruthy();
      expect(sent).toHaveLength(0);

      const user = await db("users").where({ email: "customer@example.com" }).first();
      expect(user.phone_verified_at).toBeNull();
    });

    it("refuses a second account on the same email", async () => {
      await registerUser();
      const res = await registerUser();
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("email_taken");
    });

    it("refuses when the two password fields don't match", async () => {
      const res = await post("/api/v1/auth/register", {
        email: "mismatch@example.com",
        password: "correct-horse-battery",
        confirm_password: "different-password-here",
      });
      expect(res.statusCode).toBe(400);
    });

    it("requires a password long enough to be worth having", async () => {
      const res = await post("/api/v1/auth/register", {
        email: "short@example.com",
        password: "short",
        confirm_password: "short",
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("login", () => {
    it("signs in with email and password", async () => {
      await registerUser();
      const res = await post("/api/v1/auth/login", {
        email: "customer@example.com",
        password: "correct-horse-battery",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().token).toBeTruthy();
    });

    it("rejects a wrong password", async () => {
      await registerUser();
      const res = await post("/api/v1/auth/login", {
        email: "customer@example.com",
        password: "wrong-password-here",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("linking a phone number", () => {
    async function loggedInUser() {
      const registered = await registerUser();
      return registered.json().token as string;
    }

    it("accepts Libyana prefixes in any format the customer might type", async () => {
      const token = await loggedInUser();
      for (const input of ["0921234567", "+218921234567", "00218 94 123 4567".replace(/\s/g, ""), "0941234567"]) {
        // Each attempt needs a fresh account so the "already linked" check doesn't fire.
        const res = await post("/api/v1/auth/phone/link/request", { phone: input }, token);
        expect(res.statusCode, `${input} should be accepted`).toBe(202);
      }
    });

    it("rejects Al-Madar numbers outright", async () => {
      // Al-Madar can neither fund a wallet via the Libyana transfer flow nor receive our
      // codes, so linking one could never actually be used for a top-up.
      const token = await loggedInUser();
      for (const madar of ["0911234567", "0931234567", "+218911234567"]) {
        const res = await post("/api/v1/auth/phone/link/request", { phone: madar }, token);
        expect(res.statusCode, `${madar} must be rejected`).toBe(400);
      }
    });

    it("rejects nonsense numbers", async () => {
      const token = await loggedInUser();
      for (const bad of ["123", "0812345678", "abcdefghij", "", "09212345"]) {
        const res = await post("/api/v1/auth/phone/link/request", { phone: bad }, token);
        expect(res.statusCode).toBe(400);
      }
    });

    it("requires authentication", async () => {
      const res = await post("/api/v1/auth/phone/link/request", { phone: "0921234567" });
      expect(res.statusCode).toBe(401);
    });

    it("verifies the code and attaches the number to the account", async () => {
      const token = await loggedInUser();
      await post("/api/v1/auth/phone/link/request", { phone: "0921234567" }, token);

      const res = await post(
        "/api/v1/auth/phone/link/verify",
        { phone: "0921234567", code: lastCode() },
        token
      );

      expect(res.statusCode).toBe(200);
      expect(res.json().user.phone).toBe("0921234567");

      const user = await db("users").where({ email: "customer@example.com" }).first();
      expect(user.phone).toBe("0921234567");
      expect(user.phone_verified_at).not.toBeNull();
    });

    it("refuses a wrong code, and locks the code out after repeated attempts", async () => {
      const token = await loggedInUser();
      await post("/api/v1/auth/phone/link/request", { phone: "0921234567" }, token);

      for (let i = 0; i < 5; i += 1) {
        const bad = await post("/api/v1/auth/phone/link/verify", { phone: "0921234567", code: "000000" }, token);
        expect(bad.statusCode).toBe(400);
      }

      // The real code must now be dead too — otherwise the attempt limit is decorative.
      const res = await post(
        "/api/v1/auth/phone/link/verify",
        { phone: "0921234567", code: lastCode() },
        token
      );
      expect(res.statusCode).toBe(400);
    });

    it("refuses to link a number already linked to a different account", async () => {
      const tokenA = await loggedInUser();
      await post("/api/v1/auth/phone/link/request", { phone: "0921234567" }, tokenA);
      await post("/api/v1/auth/phone/link/verify", { phone: "0921234567", code: lastCode() }, tokenA);

      const registeredB = await registerUser("second@example.com");
      const tokenB = registeredB.json().token as string;

      const res = await post("/api/v1/auth/phone/link/request", { phone: "0921234567" }, tokenB);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("phone_taken");
    });
  });

  describe("password reset", () => {
    async function registerAndLinkPhone(email = "customer@example.com", phone = "0921234567") {
      const registered = await registerUser(email);
      const token = registered.json().token as string;
      await post("/api/v1/auth/phone/link/request", { phone }, token);
      await post("/api/v1/auth/phone/link/verify", { phone, code: lastCode() }, token);
      return token;
    }

    it("lets a customer who forgot their password back in, via their linked phone", async () => {
      await registerAndLinkPhone();
      sent = [];

      const requested = await post("/api/v1/auth/password-reset/request", { phone: "0921234567" });
      expect(requested.statusCode).toBe(202);
      expect(sent).toHaveLength(1);

      const reset = await post("/api/v1/auth/password-reset/complete", {
        phone: "0921234567",
        code: lastCode(),
        password: "a-brand-new-password",
      });
      expect(reset.statusCode).toBe(200);

      const login = await post("/api/v1/auth/login", {
        email: "customer@example.com",
        password: "a-brand-new-password",
      });
      expect(login.statusCode).toBe(200);
    });

    it("revokes existing sessions, so a thief's session dies with the reset", async () => {
      const stolenToken = await registerAndLinkPhone();

      // The stolen session works right up until the reset.
      const before = await app.inject({
        method: "GET",
        url: "/api/v1/wallet",
        headers: { authorization: `Bearer ${stolenToken}` },
      });
      expect(before.statusCode).toBe(200);

      sent = [];
      await post("/api/v1/auth/password-reset/request", { phone: "0921234567" });
      await post("/api/v1/auth/password-reset/complete", {
        phone: "0921234567",
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

    it("stays silent about numbers with no account linked to them", async () => {
      sent = [];
      const res = await post("/api/v1/auth/password-reset/request", { phone: "0929999999" });

      expect(res.statusCode).toBe(202);
      expect(sent).toHaveLength(0);
    });

    it("never stores the code in the clear", async () => {
      await registerAndLinkPhone();
      sent = [];
      await post("/api/v1/auth/password-reset/request", { phone: "0921234567" });

      const row = await db("phone_verifications").where({ purpose: "reset" }).first();
      expect(row.code_hash).not.toContain(lastCode());
      expect(row.code_hash).toHaveLength(64);
    });
  });

  describe("account deletion", () => {
    it("anonymizes the account and frees the phone number for re-linking", async () => {
      const registered = await registerUser();
      const token = registered.json().token as string;
      await post("/api/v1/auth/phone/link/request", { phone: "0921234567" }, token);
      await post("/api/v1/auth/phone/link/verify", { phone: "0921234567", code: lastCode() }, token);

      const res = await post("/api/v1/auth/delete-account", { password: "correct-horse-battery" }, token);
      expect(res.statusCode).toBe(200);

      const user = await db("users").where({ status: "deleted" }).first();
      expect(user.phone).toBeNull();
      // Not a real, reachable address — but not null either, since email is required at
      // the schema level. See auth.repository.ts `anonymizeUser`.
      expect(user.email).toMatch(/@deleted\.invalid$/);
      expect(user.full_name).toBeNull();

      // The session must die with the account.
      const after = await app.inject({
        method: "GET",
        url: "/api/v1/wallet",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(after.statusCode).toBe(401);

      // And the number is usable again by its next owner.
      const other = await registerUser("someone-else@example.com");
      const otherToken = other.json().token as string;
      const reused = await post("/api/v1/auth/phone/link/request", { phone: "0921234567" }, otherToken);
      expect(reused.statusCode).toBe(202);
    });

    it("refuses while the wallet still holds money", async () => {
      const registered = await registerUser();
      const token = registered.json().token as string;
      const user = await db("users").where({ email: "customer@example.com" }).first();
      const wallet = await db("wallets").where({ user_id: user.id }).first();
      await creditTestWallet(user.id, wallet.id, 25);

      const res = await post("/api/v1/auth/delete-account", { password: "correct-horse-battery" }, token);

      // Deleting here would destroy the customer's funds.
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("wallet_not_empty");
    });

    it("refuses while an order is still unsettled", async () => {
      const registered = await registerUser();
      const token = registered.json().token as string;
      const user = await db("users").where({ email: "customer@example.com" }).first();

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
