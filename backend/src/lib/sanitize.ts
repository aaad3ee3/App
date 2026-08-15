/**
 * Sanitizers for third-party (supplier) data before it is persisted.
 *
 * Everything the catalog sync stores — product names, descriptions, image URLs — comes
 * from an external API we do not control, and is later rendered in the Flutter app and
 * the admin dashboard. Cleaning it once at the boundary is far more reliable than hoping
 * every future consumer remembers to escape it: a supplier breach, or simply a sloppy
 * product name typed into their panel, should never be able to reach a rendering
 * surface as an executable URL or a control character.
 *
 * The character classes below are built from escape sequences rather than regex literals
 * so that this file never itself contains the control characters it is filtering.
 */

/** Schemes safe to hand to an <img> tag. Anything else is rejected outright. */
const ALLOWED_IMAGE_PROTOCOLS = new Set(["https:", "http:"]);

/** C0 and C1 control characters. */
const CONTROL_CHARS_SOURCE = "[\\u0000-\\u001F\\u007F-\\u009F]";

/**
 * Bidirectional formatting characters. These matter most for a right-to-left storefront:
 * U+202E and friends can visually reverse a product name so that what the customer reads
 * and what they are actually charged for disagree.
 */
const BIDI_CHARS_SOURCE = "[\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]";

const CONTROL_CHARS = new RegExp(CONTROL_CHARS_SOURCE);
const BIDI_CHARS = new RegExp(BIDI_CHARS_SOURCE);
const CONTROL_CHARS_GLOBAL = new RegExp(CONTROL_CHARS_SOURCE, "g");
const BIDI_CHARS_GLOBAL = new RegExp(BIDI_CHARS_SOURCE, "g");

/**
 * Returns the URL only if it is a plain http(s) image reference, else null.
 *
 * Rejects `javascript:`, `data:`, `blob:`, `file:` and friends. `data:` is rejected even
 * though it cannot execute inside an `<img src>`, because it is a common exfiltration
 * and CSP-bypass vector and no legitimate supplier serves catalog art that way.
 */
export function sanitizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // A URL containing control characters can be parsed differently by different consumers
  // (Dart's Uri vs a browser's URL parser), which is exactly how filter bypasses happen.
  if (CONTROL_CHARS.test(trimmed) || BIDI_CHARS.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!ALLOWED_IMAGE_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.toString();
}

/**
 * Collapses whitespace and strips control characters from supplier-provided text,
 * truncating to `maxLength` so one absurd name cannot break list layouts.
 */
export function sanitizeText(raw: string | null | undefined, maxLength = 500): string | null {
  if (raw === null || raw === undefined) return null;

  const cleaned = String(raw)
    .replace(CONTROL_CHARS_GLOBAL, " ")
    .replace(BIDI_CHARS_GLOBAL, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Same as sanitizeText but guarantees a non-empty result, since a product with no name at
 * all is worse in the UI than one labelled with its supplier reference.
 */
export function sanitizeName(raw: string | null | undefined, fallback: string, maxLength = 300): string {
  return sanitizeText(raw, maxLength) ?? fallback;
}
