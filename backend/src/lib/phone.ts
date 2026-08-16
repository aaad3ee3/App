/**
 * Normalizes Libyan mobile numbers to a single canonical local form: `0` + 9 digits
 * (e.g. `0912345678`), regardless of how the user or the SMS gateway formatted it
 * (`+218912345678`, `00218912345678`, `218912345678`, with spaces/dashes, etc.).
 *
 * Used by both `topups.service.ts` (when a user commits to a sender phone) and
 * `sms.parser.ts` (when parsing the payer phone out of the Libyana SMS text) so the
 * matching query in `sms.matcher.ts` can compare on equality.
 *
 * Returns null if the input doesn't look like a valid Libyan mobile number after
 * normalization (9 digits after the country/trunk prefix is stripped, starting with 9 —
 * Libyana/Al-Madar mobile prefixes are 091/092/094/095 etc., i.e. always start with 9
 * once the leading 0 is dropped).
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
 * Libyana's mobile prefixes. Al-Madar's (094/095) are deliberately absent: the whole
 * payment pipeline is built on Libyana transfers, so an Al-Madar number can neither fund
 * a wallet nor receive our verification codes. Accepting one would let someone register
 * an account they can never top up or recover.
 */
const LIBYANA_PREFIXES = ["091", "092"] as const;

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
