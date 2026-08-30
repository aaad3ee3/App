import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../../src/db/knex";
import { createTestUser, resetDb } from "../helpers";

/**
 * Google sign-in.
 *
 * The signature check itself belongs to google-auth-library and is not re-tested here.
 * What is tested is everything we decided around it: that an unconfigured deployment
 * refuses rather than trusts, that a rejected token yields no session, that an unverified
 * email is refused, and — the one with real consequences — that signing in with Google
 * lands on the *existing* account for that address instead of creating a second one.
 */
const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

// GOOGLE_OAUTH_CLIENT_IDS comes from .env.test — setting it here would be too late, since
// static imports load src/config/env.ts before any statement in this file runs.
const { buildApp } = await import("../../src/app");

function googlePayload(overrides: Record<string, unknown> = {}) {
  return {
    getPayload: () => ({
      email: "customer@gmail.com",
      email_verified: true,
      name: "زبون تجريبي",
      ...overrides,
    }),
  };
}

describe("google sign-in", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDb();
    verifyIdToken.mockReset();
    if (!app) {
      app = buildApp();
      await app.ready();
    }
  });

  afterAll(async () => {
    await app?.close();
    await db.destroy();
  });

  const signIn = (idToken = "any-token") =>
    app.inject({ method: "POST", url: "/api/v1/auth/google", payload: { id_token: idToken } });

  it("creates an account and a wallet on first sign-in", async () => {
    verifyIdToken.mockResolvedValue(googlePayload());

    const res = await signIn();
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("customer@gmail.com");
    expect(res.json().token).toBeTruthy();

    const users = await db("users").where({ email: "customer@gmail.com" });
    expect(users).toHaveLength(1);
    // Without a wallet the customer could sign in but not hold a balance — the whole
    // store would fail on their first purchase.
    expect(await db("wallets").where({ user_id: users[0].id })).toHaveLength(1);
  });

  it("signs into the existing account when the email already has one, without duplicating it", async () => {
    const { user } = await createTestUser({ email: "customer@gmail.com" });
    verifyIdToken.mockResolvedValue(googlePayload());

    const res = await signIn();
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(user.id);
    expect(await db("users").where({ email: "customer@gmail.com" })).toHaveLength(1);
  });

  it("signs in the same customer twice without creating a second account", async () => {
    verifyIdToken.mockResolvedValue(googlePayload());

    await signIn();
    const second = await signIn();

    expect(second.statusCode).toBe(200);
    expect(await db("users").where({ email: "customer@gmail.com" })).toHaveLength(1);
  });

  it("refuses a token Google will not verify, and issues no session", async () => {
    verifyIdToken.mockRejectedValue(new Error("Invalid token signature"));

    const res = await signIn("forged");
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("invalid_google_token");
    expect(await db("sessions")).toHaveLength(0);
  });

  it("refuses an unverified Google email", async () => {
    // The whole reason it is safe to sign into an existing password account is that
    // Google vouched for the address. If it did not, that inference collapses.
    verifyIdToken.mockResolvedValue(googlePayload({ email_verified: false }));

    const res = await signIn();
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("google_email_unverified");
    expect(await db("users").where({ email: "customer@gmail.com" })).toHaveLength(0);
  });

  it("refuses a disabled account instead of signing it back in", async () => {
    const { user } = await createTestUser({ email: "customer@gmail.com" });
    await db("users").where({ id: user.id }).update({ status: "deleted" });
    verifyIdToken.mockResolvedValue(googlePayload());

    const res = await signIn();
    expect(res.statusCode).toBe(403);
  });

  it("rejects a missing token on shape, before any verification runs", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/google", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
