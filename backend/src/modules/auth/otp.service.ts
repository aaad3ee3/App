import crypto from "node:crypto";
import { db } from "../../db/knex";
import { env } from "../../config/env";
import { sha256Hex } from "../../lib/crypto";
import { getSmsSender } from "../../lib/sms-sender";
import { HttpError } from "../../plugins/error-handler.plugin";
import { createResalaClientFromEnv, isResalaConfigured, ResalaApiError } from "../../adapters/resala/resala.client";

export type OtpPurpose = "register" | "reset" | "link";

interface VerificationRow {
  id: string;
  phone: string;
  code_hash: string;
  purpose: OtpPurpose;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

/**
 * Six digits, generated with a CSPRNG. `Math.random` would be predictable enough to
 * matter here — this code is the only thing standing between an attacker and someone's
 * wallet during a password reset.
 */
function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function messageFor(purpose: OtpPurpose, code: string): string {
  if (purpose === "register") {
    return `رمز تفعيل حسابك في سايح: ${code}\nلا تشاركه مع أي شخص.`;
  }
  if (purpose === "link") {
    return `رمز ربط رقم هاتفك في سايح: ${code}\nلا تشاركه مع أي شخص. إذا لم تطلبه، تجاهل هذه الرسالة.`;
  }
  return `رمز استعادة كلمة المرور في سايح: ${code}\nلا تشاركه مع أي شخص. إذا لم تطلبه، تجاهل هذه الرسالة.`;
}

/**
 * Issues a code and sends it by SMS.
 *
 * Rate limited per phone number rather than per IP: the abuse that matters is flooding
 * one victim's handset with codes, and an attacker rotates IPs far more easily than they
 * rotate someone else's phone number.
 *
 * When RESALA_API_TOKEN is configured, Resala both generates and delivers the code in one
 * call (POST /pins) — there is no local generateCode() in that case, and its returned
 * `pin` is what gets hashed and stored below, so verification (consumeCode) works
 * identically either way. Falls back to the existing local-generate + SmsSender path
 * otherwise, exactly as before.
 */
export async function issueCode(phone: string, purpose: OtpPurpose): Promise<void> {
  const windowStart = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db<VerificationRow>("phone_verifications")
    .where({ phone })
    .andWhere("created_at", ">", windowStart)
    .count<{ count: string }[]>("id as count");

  if (Number(rows[0]?.count ?? 0) >= env.OTP_REQUESTS_PER_HOUR) {
    throw new HttpError(
      429,
      "too_many_codes",
      "طلبت رموزاً كثيرة. انتظر ساعة ثم حاول مرة أخرى."
    );
  }

  const useResala = isResalaConfigured();
  let code: string;
  if (useResala) {
    try {
      const result = await createResalaClientFromEnv().sendPin(phone, {
        // Real SMS/credit only in production — every other environment (dev, staging,
        // the test suite) must never actually send or get charged for one.
        test: env.NODE_ENV !== "production",
        serviceName: env.RESALA_SERVICE_NAME,
      });
      code = result.pin;
    } catch (err) {
      if (err instanceof ResalaApiError) {
        throw new HttpError(502, "sms_delivery_failed", "تعذر إرسال رمز التحقق، حاول مرة أخرى بعد قليل.");
      }
      throw err;
    }
  } else {
    code = generateCode();
  }

  // Invalidate any earlier live code for this phone+purpose, so only the newest works.
  // Without this, an older code stays valid and widens the guessing window.
  await db("phone_verifications")
    .where({ phone, purpose })
    .whereNull("consumed_at")
    .update({ consumed_at: new Date() });

  await db("phone_verifications").insert({
    phone,
    code_hash: sha256Hex(code),
    purpose,
    expires_at: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000),
  });

  // Resala already sent the SMS as part of sendPin above — only the local-generate path
  // still needs a separate send.
  if (!useResala) {
    await getSmsSender().send(phone, messageFor(purpose, code));
  }
}

/**
 * Checks a code and consumes it on success.
 *
 * Throws on every failure path with the same message, so a caller cannot use the error
 * text to learn whether the phone has a pending code at all.
 */
export async function consumeCode(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
  // The transaction reports the outcome instead of throwing inside it. Throwing from
  // within would roll back the very write that records the failure — the attempt counter
  // would reset on every wrong guess, leaving a 6-digit code brute-forceable indefinitely.
  const ok = await db.transaction(async (trx) => {
    // Locked: two requests racing on the same code must not both consume it, and the
    // attempt counter has to be accurate to be a limit at all.
    const row = await trx<VerificationRow>("phone_verifications")
      .where({ phone, purpose })
      .whereNull("consumed_at")
      .orderBy("created_at", "desc")
      .forUpdate()
      .first();

    if (!row) return false;

    if (row.expires_at.getTime() < Date.now()) {
      await trx("phone_verifications").where({ id: row.id }).update({ consumed_at: new Date() });
      return false;
    }

    if (row.attempts >= env.OTP_MAX_ATTEMPTS) {
      // Burn it rather than leaving a code that can be hammered indefinitely.
      await trx("phone_verifications").where({ id: row.id }).update({ consumed_at: new Date() });
      return false;
    }

    // Constant-time compare: a plain === leaks, through timing, how many leading
    // characters matched, which turns 10^6 guesses into far fewer.
    const provided = sha256Hex(code.trim());
    const matches = crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(row.code_hash, "hex"));

    if (!matches) {
      await trx("phone_verifications").where({ id: row.id }).increment("attempts", 1);
      return false;
    }

    await trx("phone_verifications").where({ id: row.id }).update({ consumed_at: new Date() });
    return true;
  });

  if (!ok) {
    // One message for every failure path, so the response cannot be used to tell an
    // expired code from a wrong one from a phone with no pending code at all.
    throw new HttpError(400, "invalid_code", "الرمز غير صحيح أو منتهي الصلاحية.");
  }
}

/** Housekeeping — consumed and expired codes have no further use. */
export function purgeOldCodes(olderThan: Date): Promise<number> {
  return db("phone_verifications").where("created_at", "<", olderThan).del();
}
