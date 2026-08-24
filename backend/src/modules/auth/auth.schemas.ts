import { z } from "zod";
import { normalizeLibyanaPhone } from "../../lib/phone";

/**
 * Every customer-supplied number goes through here. It normalizes any format people
 * actually type (+218…, 00218…, 0921…, with spaces) and rejects anything that is not
 * Libyana — an Al-Madar number can neither fund a wallet nor receive our codes, so
 * accepting one would create an account that can never be topped up or recovered.
 */
const libyanaPhone = z
  .string()
  .trim()
  .min(1, "رقم الهاتف مطلوب")
  .transform((value, ctx) => {
    const normalized = normalizeLibyanaPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "أدخل رقم ليبيانا صحيح (يبدأ بـ 092 أو 094)",
      });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Twelve characters, no composition rules. Length does far more for real-world strength
 * than forcing a symbol, which mostly produces `Password1!` and a reset request later.
 */
const password = z.string().min(12, "كلمة المرور يجب أن تكون 12 حرفاً على الأقل").max(200);

const code = z.string().trim().regex(/^\d{6}$/, "الرمز مكوّن من 6 أرقام");

/**
 * Sign-up is email + password now — no SMS round trip to create an account. A phone
 * number only enters the picture later, when the customer links one to fund top-ups
 * (see phoneLink*Schema below), because that is the only place a Libyana number is
 * actually load-bearing.
 */
export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("أدخل بريداً إلكترونياً صحيحاً"),
    password,
    confirm_password: z.string(),
    full_name: z.string().trim().min(1).max(200).optional(),
    // A friend's referral code, typed or deep-linked in. Unknown/invalid codes are
    // silently ignored (see auth.service.ts) — a typo here must never block signup.
    referral_code: z.string().trim().min(1).max(20).optional(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirm_password"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Capped well above a real Google ID token (~1 KB) and well below the body limit, so an
 * oversized payload is rejected on shape before it reaches signature verification.
 */
export const googleSignInSchema = z.object({
  id_token: z.string().trim().min(1, "رمز جوجل مفقود").max(4096),
});
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

/**
 * Linking a phone is how a signed-in customer proves a Libyana number is really theirs,
 * so top-up transfers from it can be matched to their account. Two steps, same shape as
 * the old registration flow: request a code, then confirm it.
 */
export const linkPhoneRequestSchema = z.object({
  phone: libyanaPhone,
});
export type LinkPhoneRequestInput = z.infer<typeof linkPhoneRequestSchema>;

export const linkPhoneVerifySchema = z.object({
  phone: libyanaPhone,
  code,
});
export type LinkPhoneVerifyInput = z.infer<typeof linkPhoneVerifySchema>;

/** Admin dashboard staff sign in by email, not phone — they are not necessarily Libyana
 * customers, and requiring one would tie internal tooling access to a carrier account. */
export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const requestPasswordResetSchema = z.object({
  phone: libyanaPhone,
});

export const completePasswordResetSchema = z.object({
  phone: libyanaPhone,
  code,
  password,
});
export type CompletePasswordResetInput = z.infer<typeof completePasswordResetSchema>;

export const deleteAccountSchema = z.object({
  // Re-authentication: deletion is irreversible, so a borrowed unlocked phone should not
  // be enough to trigger it.
  password: z.string().min(1),
});
