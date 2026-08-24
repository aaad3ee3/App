import argon2 from "argon2";
import { env } from "../../config/env";
import { DEFAULT_CURRENCY } from "../../config/constants";
import { generateOpaqueToken, sha256Hex } from "../../lib/crypto";
import { HttpError } from "../../plugins/error-handler.plugin";
import * as repo from "./auth.repository";
import { verifyGoogleIdToken } from "./google.service";
import type { AdminLoginInput, CompletePasswordResetInput, LoginInput, RegisterInput } from "./auth.schemas";
import type { UserRow } from "../../db/types";
import * as otp from "./otp.service";

function publicUser(user: { id: string; phone: string | null; email: string | null; full_name: string | null }) {
  return { id: user.id, phone: user.phone, email: user.email, full_name: user.full_name };
}

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

/** Creates the account and signs in. No SMS round trip — see completeLinkPhone for how a
 * phone number gets attached (and verified) once the customer actually wants to top up. */
export async function register(input: RegisterInput, meta: SessionMeta) {
  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    throw new HttpError(409, "email_taken", "هذا البريد مستخدم بالفعل. سجّل الدخول أو استعد كلمة المرور.");
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user = await repo.createUserWithWallet(
    { email: input.email, passwordHash, fullName: input.full_name ?? null },
    DEFAULT_CURRENCY
  );

  const token = await issueSession(user.id, meta);
  return { token, user: publicUser(user) };
}

/**
 * Sign in (or sign up) with a Google ID token.
 *
 * The token is verified first — see google.service.ts for what that guarantees. By the
 * time we get here Google has attested that the holder controls this email address.
 *
 * An existing password account with the same email is *signed into*, not rejected as a
 * duplicate. Proving control of the address is at least as strong as knowing the password,
 * so refusing would only strand a customer who signed up one way and came back the other.
 *
 * A new account gets an unusable password: a hash of random bytes nobody has. That keeps
 * `password_hash` NOT NULL without a migration, and makes password login impossible for
 * this account rather than merely unlikely — there is no plaintext that verifies against
 * it. Such a customer recovers via password reset once they link a phone, exactly like
 * anyone else.
 */
export async function loginWithGoogle(idToken: string, meta: SessionMeta) {
  const identity = await verifyGoogleIdToken(idToken);

  const existing = await repo.findUserByEmail(identity.email);
  if (existing) {
    if (existing.status !== "active") {
      throw new HttpError(403, "account_disabled", "تم تعطيل هذا الحساب");
    }
    const token = await issueSession(existing.id, meta);
    return { token, user: publicUser(existing) };
  }

  const unusablePasswordHash = await argon2.hash(generateOpaqueToken(), { type: argon2.argon2id });
  const user = await repo.createUserWithWallet(
    { email: identity.email, passwordHash: unusablePasswordHash, fullName: identity.fullName },
    DEFAULT_CURRENCY
  );

  const token = await issueSession(user.id, meta);
  return { token, user: publicUser(user) };
}

/**
 * Step 1 of linking a phone number to an already-signed-in account: send it a code.
 *
 * Refuses up front if the number is already linked to a *different* account — silently
 * accepting and then failing at verify time would make the customer type a whole code
 * only to hit a wall. Re-linking your own already-linked number is harmless and allowed.
 */
export async function requestLinkPhone(userId: string, phone: string): Promise<void> {
  const owner = await repo.findUserByPhone(phone);
  if (owner && owner.id !== userId) {
    throw new HttpError(409, "phone_taken", "هذا الرقم مرتبط بحساب آخر بالفعل.");
  }
  await otp.issueCode(phone, "link");
}

/** Step 2: verify the code and attach the number to the caller's account. */
export async function completeLinkPhone(userId: string, phone: string, code: string) {
  await otp.consumeCode(phone, "link", code);

  try {
    const user = await repo.setUserPhone(userId, phone);
    return publicUser(user);
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      // Lost a race against someone else linking the same number between the request
      // and verify steps — vanishingly rare, but the unique index is what actually
      // prevents two accounts from sharing a top-up-funding number.
      throw new HttpError(409, "phone_taken", "هذا الرقم ارتبط بحساب آخر للتو. جرّب رقماً آخر.");
    }
    throw err;
  }
}

/**
 * Shared by every password login path once the account has been looked up: lockout,
 * password verification with failed-attempt bookkeeping, and the active-status check.
 * `invalidMessage` lets each caller keep its own wording (phone vs email) without
 * duplicating the lockout/verify/status sequence itself.
 */
async function verifyPasswordLogin(user: UserRow, password: string, invalidMessage: string): Promise<void> {
  if (repo.isLocked(user)) {
    throw new HttpError(
      429,
      "account_locked",
      "تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة. حاول بعد قليل."
    );
  }

  const passwordOk = await argon2.verify(user.password_hash, password).catch(() => false);
  if (!passwordOk) {
    await repo.registerFailedLogin(user.id, env.LOGIN_MAX_FAILED_ATTEMPTS, env.LOGIN_LOCKOUT_MINUTES);
    throw new HttpError(401, "invalid_credentials", invalidMessage);
  }

  if (user.status !== "active") {
    throw new HttpError(403, "account_disabled", "تم تعطيل هذا الحساب");
  }

  await repo.resetFailedLogin(user.id);
}

export async function login(input: LoginInput, meta: SessionMeta) {
  const invalidMessage = "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  const user = await repo.findUserByEmail(input.email);
  if (!user) {
    throw new HttpError(401, "invalid_credentials", invalidMessage);
  }

  await verifyPasswordLogin(user, input.password, invalidMessage);
  const token = await issueSession(user.id, meta);
  return { token, user: publicUser(user) };
}

/**
 * Admin dashboard sign-in. Deliberately the same "invalid credentials" message whether
 * the email does not exist, the password is wrong, or the account exists but is not an
 * admin — distinguishing those would let a caller probe which emails have admin access.
 */
export async function loginAdmin(input: AdminLoginInput, meta: SessionMeta) {
  const invalidMessage = "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  const user = await repo.findUserByEmail(input.email);
  if (!user || !user.is_admin) {
    throw new HttpError(401, "invalid_credentials", invalidMessage);
  }

  await verifyPasswordLogin(user, input.password, invalidMessage);
  const token = await issueSession(user.id, meta);
  return { token, user: publicUser(user) };
}

/**
 * Step 1 of password reset. Always resolves the same way, whether or not the number is
 * registered — a different response here turns this into a membership oracle.
 */
export async function requestPasswordReset(phone: string): Promise<void> {
  const user = await repo.findUserByPhone(phone);
  if (!user) return;
  await otp.issueCode(phone, "reset");
}

/**
 * Step 2: set the new password.
 *
 * Every existing session is revoked. A reset is what someone does after losing the phone
 * or suspecting a compromise, so leaving the attacker's session alive would defeat the
 * entire point.
 */
export async function completePasswordReset(input: CompletePasswordResetInput): Promise<void> {
  await otp.consumeCode(input.phone, "reset", input.code);

  const user = await repo.findUserByPhone(input.phone);
  if (!user) {
    // The code verified but the account vanished between the two steps. Nothing sensible
    // to do, and nothing sensitive to disclose.
    throw new HttpError(400, "invalid_code", "الرمز غير صحيح أو منتهي الصلاحية.");
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  await repo.updatePassword(user.id, passwordHash);
  await repo.revokeAllSessionsForUser(user.id);
  await repo.resetFailedLogin(user.id);
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

/**
 * Deletes the customer's account. Required by both app stores, and treated as a real
 * operation rather than a checkbox.
 *
 * Refuses while money or work is outstanding. Deleting an account that still holds a
 * balance destroys the customer's funds, and deleting one with an order in flight leaves
 * a supplier purchase nobody can be paid for or refunded against. Both are worse than a
 * clear "settle this first" message.
 *
 * The account is anonymized rather than row-deleted: the wallet ledger records real
 * money movements and must survive, so personal data is cleared and the account is
 * permanently disabled instead. See auth.repository.ts `anonymizeUser`.
 */
export async function deleteAccount(userId: string, password: string): Promise<{ ok: true }> {
  const user = await repo.findUserById(userId);
  if (!user) throw new HttpError(404, "not_found", "الحساب غير موجود");

  const passwordOk = await argon2.verify(user.password_hash, password).catch(() => false);
  if (!passwordOk) {
    throw new HttpError(401, "invalid_credentials", "كلمة المرور غير صحيحة");
  }

  const balance = await repo.getWalletBalance(userId);
  if (balance > 0) {
    throw new HttpError(
      409,
      "wallet_not_empty",
      `لا يمكن حذف الحساب ورصيدك ${balance.toFixed(3)} د.ل. استخدم الرصيد أو تواصل مع الدعم لاستعادته أولاً.`
    );
  }

  const pending = await repo.countUnsettledOrders(userId);
  if (pending > 0) {
    throw new HttpError(
      409,
      "orders_in_flight",
      "لديك طلبات قيد التنفيذ. انتظر اكتمالها قبل حذف الحساب."
    );
  }

  await repo.anonymizeUser(userId);
  return { ok: true };
}
