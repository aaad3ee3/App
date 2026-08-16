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

export const startRegistrationSchema = z.object({
  phone: libyanaPhone,
});
export type StartRegistrationInput = z.infer<typeof startRegistrationSchema>;

export const completeRegistrationSchema = z.object({
  phone: libyanaPhone,
  code,
  password,
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
});
export type CompleteRegistrationInput = z.infer<typeof completeRegistrationSchema>;

export const loginSchema = z.object({
  phone: libyanaPhone,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

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
