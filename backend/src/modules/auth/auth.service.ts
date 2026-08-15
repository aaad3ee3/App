import argon2 from "argon2";
import { env } from "../../config/env";
import { DEFAULT_CURRENCY } from "../../config/constants";
import { generateOpaqueToken, sha256Hex } from "../../lib/crypto";
import { HttpError } from "../../plugins/error-handler.plugin";
import * as repo from "./auth.repository";
import type { LoginInput, RegisterInput } from "./auth.schemas";

export interface SessionMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

async function issueSession(userId: string, meta: SessionMeta): Promise<string> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await repo.createSession({
    userId,
    tokenHash: sha256Hex(token),
    expiresAt,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });
  // Trim to the newest N live sessions, so a token stolen from an old device stops
  // working once the owner has signed in from a few newer ones.
  await repo.revokeExcessSessions(userId, env.MAX_SESSIONS_PER_USER);
  return token;
}

export async function register(input: RegisterInput, meta: SessionMeta) {
  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    throw new HttpError(409, "email_taken", "An account with this email already exists");
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user = await repo.createUserWithWallet(
    { email: input.email, passwordHash, fullName: input.full_name ?? null },
    DEFAULT_CURRENCY
  );

  const token = await issueSession(user.id, meta);
  return { token, user: { id: user.id, email: user.email, full_name: user.full_name } };
}

export async function login(input: LoginInput, meta: SessionMeta) {
  const user = await repo.findUserByEmail(input.email);
  if (!user) {
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }

  if (repo.isLocked(user)) {
    throw new HttpError(
      429,
      "account_locked",
      `Account temporarily locked due to repeated failed attempts. Try again later.`
    );
  }

  const passwordOk = await argon2.verify(user.password_hash, input.password).catch(() => false);
  if (!passwordOk) {
    await repo.registerFailedLogin(user.id, env.LOGIN_MAX_FAILED_ATTEMPTS, env.LOGIN_LOCKOUT_MINUTES);
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }

  if (user.status !== "active") {
    throw new HttpError(403, "account_disabled", "This account has been disabled");
  }

  await repo.resetFailedLogin(user.id);
  const token = await issueSession(user.id, meta);
  return { token, user: { id: user.id, email: user.email, full_name: user.full_name } };
}

export async function logout(token: string): Promise<void> {
  await repo.revokeSessionByTokenHash(sha256Hex(token));
}

/**
 * Signs the user out on every device. This is the user-facing remedy for a lost or
 * stolen phone, so it must revoke the caller's own session too.
 */
export async function logoutEverywhere(userId: string): Promise<{ revoked: number }> {
  const revoked = await repo.revokeAllSessionsForUser(userId);
  return { revoked };
}
