/**
 * Search-text normalization, kept in step with the `sayeh_search_normalize` SQL function
 * created in the catalog-search migration. Both sides must produce the same output, or a
 * query normalized here would never match a name normalized there.
 *
 * The diacritics are built from character codes rather than typed literally: they are
 * combining marks, so on screen they attach themselves to whatever precedes them, which
 * makes the source unreadable and easy to corrupt on a careless edit.
 */

/** أ إ آ ٱ — all folded to bare alef. */
const ALEF_VARIANTS = "أإآٱ";
/** ى (alef maqsura) → ي, ة (ta marbuta) → ه. */
const ALEF_MAQSURA = "ى";
const TA_MARBUTA = "ة";
const PLAIN_ALEF = "ا";
const PLAIN_YA = "ي";
const PLAIN_HA = "ه";
/** Tashkeel (fathatan, dammatan, kasratan, fatha, damma, kasra, shadda, sukun) and tatweel. */
const DIACRITICS = String.fromCharCode(0x64b, 0x64c, 0x64d, 0x64e, 0x64f, 0x650, 0x651, 0x652, 0x640);

/**
 * `translate()` arguments for the SQL side: characters in FROM beyond the length of TO are
 * deleted, which is exactly how the diacritics disappear.
 */
export const TRANSLATE_FROM = ALEF_VARIANTS + ALEF_MAQSURA + TA_MARBUTA + DIACRITICS;
export const TRANSLATE_TO = PLAIN_ALEF.repeat(ALEF_VARIANTS.length) + PLAIN_YA + PLAIN_HA;

const REPLACEMENTS: [RegExp, string][] = [
  [new RegExp(`[${ALEF_VARIANTS}]`, "g"), PLAIN_ALEF],
  [new RegExp(ALEF_MAQSURA, "g"), PLAIN_YA],
  [new RegExp(TA_MARBUTA, "g"), PLAIN_HA],
  [new RegExp(`[${DIACRITICS}]`, "g"), ""],
];

/**
 * Folds the spelling variants Arabic users type interchangeably — "ألعاب" and "العاب",
 * "بطاقة" and "بطاقه" — onto one form, and lowercases Latin so "PUBG" finds "pubg".
 */
export function normalizeSearchText(input: string): string {
  let out = input.toLowerCase();
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Escapes the characters SQL's LIKE treats as wildcards. Without this a customer typing
 * "%" would match the entire catalog and "_" would match any single character — a query
 * returning every row is both a surprising result and a needless load amplifier.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Names customers type versus names suppliers store.
 *
 * Our catalog is labelled in Arabic ("إنستغرام", "شدات ببجي"), but half of Libya types
 * these brands in Latin, and the Arabic spellings themselves vary by region — انستغرام,
 * انستقرام, انستا all mean the same thing. Without this table, searching "instagram" in a
 * store that plainly sells Instagram followers returns nothing, which reads as a broken
 * app rather than a missing product.
 *
 * Every entry in a group matches every other, in both directions. Written normalized
 * (see normalizeSearchText) so no runtime folding is needed at lookup time.
 */
const ALIAS_GROUPS: string[][] = [
  ["pubg", "ببجي", "بابجي", "شدات", "uc"],
  ["freefire", "free fire", "فري فاير", "فريفاير", "جواهر"],
  ["instagram", "insta", "انستغرام", "انستقرام", "انستا"],
  ["tiktok", "tik tok", "تيك توك", "تيكتوك"],
  ["facebook", "fb", "فيسبوك", "فيس بوك"],
  ["youtube", "يوتيوب", "يوتوب"],
  ["telegram", "تيليجرام", "تليجرام", "تلجرام"],
  ["whatsapp", "واتساب", "واتس اب"],
  ["twitter", "x", "تويتر", "اكس"],
  ["snapchat", "snap", "سناب شات", "سناب"],
  ["playstation", "psn", "ps", "بلايستيشن", "بلاي ستيشن", "سوني"],
  ["xbox", "اكس بوكس"],
  ["steam", "ستيم"],
  ["roblox", "robux", "روبلوكس", "روبوكس"],
  ["netflix", "نتفلكس", "نتفليكس"],
  ["shahid", "شاهد"],
  ["google play", "google", "جوجل بلاي", "جوجل", "قوقل"],
  ["itunes", "apple", "ايتونز", "ابل", "ايفون"],
  ["followers", "متابعين", "متابعه"],
  ["likes", "لايكات", "اعجابات"],
  ["views", "مشاهدات"],
  ["subscribers", "مشتركين"],
];

/** Reverse lookup: normalized term → every term that means the same thing. */
const ALIAS_INDEX = new Map<string, string[]>();
for (const group of ALIAS_GROUPS) {
  for (const term of group) {
    ALIAS_INDEX.set(term, group);
  }
}

/**
 * Expands one search term into every spelling of the same thing, the term itself first.
 *
 * Alternatives within a group are ORed, while the terms themselves stay ANDed — typing
 * more words still narrows the result set.
 */
export function expandTerm(normalizedTerm: string): string[] {
  const group = ALIAS_INDEX.get(normalizedTerm);
  if (!group) return [normalizedTerm];
  return [normalizedTerm, ...group.filter((alias) => alias !== normalizedTerm)];
}

/**
 * Splits a query into search terms — normalized, alias-expanded, wildcard-safe, capped.
 *
 * The cap matters: each term becomes another clause in the WHERE, so an unbounded term
 * count would let one request build an arbitrarily expensive query.
 */
export function tokenizeQuery(raw: string, maxTerms = 6): string[][] {
  return normalizeSearchText(raw.trim())
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .slice(0, maxTerms)
    .map((term) => expandTerm(term).map(escapeLikePattern));
}
