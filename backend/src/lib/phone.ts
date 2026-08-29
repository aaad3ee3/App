/**
 * Normalizes Libyan mobile numbers to a single canonical local form: `0` + 9 digits
 * (e.g. `0921234567`), regardless of how the user or the SMS gateway formatted it
 * (`+218921234567`, `00218921234567`, `218921234567`, with spaces/dashes, etc.).
 *
 * Used by both `topups.service.ts` (when a user commits to a sender phone) and
 * `sms.parser.ts` (when parsing the payer phone out of the Libyana SMS text) so the
 * matching query in `sms.matcher.ts` can compare on equality.
 *
 * Returns null if the input doesn't look like a valid Libyan mobile number after
 * normalization: 9 digits once the country/trunk prefix is stripped, always starting
 * with 9. Deliberately carrier-agnostic — it accepts Libyana (092/094) and Al-Madar
 * (091/093) alike, because it also parses whatever number arrives in an incoming SMS.
 * Use `normalizeLibyanaPhone` below wherever a customer supplies their own number.
 */
export function normalizeLibyanPhone(raw: string): string | null {
  if (!raw) return null;

  let digits = raw.replace(/[^\d+]/g, "");

  if (digits.startsWith("+218")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("00218")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("218") && digits.length > 9) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/^\+/, "");

  if (!/^9\d{8}$/.test(digits)) {
    return null;
  }

  return `0${digits}`;
}

/**
 * Libyana's mobile prefixes. Al-Madar's (091 and 093) are deliberately absent: the whole
 * payment pipeline is built on Libyana transfers, so an Al-Madar number can neither fund
 * a wallet nor receive our verification codes. Accepting one would let someone register
 * an account they can never top up or recover.
 */
const LIBYANA_PREFIXES = ["092", "094"] as const;

export function isLibyanaNumber(normalized: string): boolean {
  return LIBYANA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Normalizes and accepts only Libyana numbers. Use this everywhere a customer supplies
 * their own number — registration, password reset, and the top-up sender — as opposed to
 * `normalizeLibyanPhone`, which stays permissive for parsing whatever arrives in an
 * incoming SMS.
 */
export function normalizeLibyanaPhone(raw: string): string | null {
  const normalized = normalizeLibyanPhone(raw);
  if (!normalized) return null;
  return isLibyanaNumber(normalized) ? normalized : null;
}

/**
 * Converts the canonical local form (`0` + 9 digits, e.g. `0921234567`) to the
 * international form some external providers require instead — country code, no leading
 * zero (`218921234567`). Resala's `/pins` endpoint is the reason this exists: its docs
 * specify exactly this shape, and sending it the local form silently mismatches (their
 * API accepts the malformed request but the SMS never actually reaches the handset) —
 * see otp.service.ts. Returns null for anything that isn't already a normalized local
 * number, so a caller can't accidentally feed it unvalidated user input.
 */
export function toInternationalLibyanPhone(localNumber: string): string | null {
  if (!/^0\d{9}$/.test(localNumber)) return null;
  return `218${localNumber.slice(1)}`;
}
