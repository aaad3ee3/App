/**
 * Auto-fills a category icon from Simple Icons (cdn.simpleicons.org — the same CDN
 * plus-categorization.ts already uses for social platforms) by matching known brand
 * keywords against the category name. Libya Play only ships real images for a handful of
 * its categories (see catalog-sync.service.ts), so most would otherwise stay blank.
 *
 * Deliberately short: every entry here is a brand I could confidently confirm has a
 * Simple Icons slug. A wrong or guessed logo is worse than the plain fallback icon the
 * app already shows for an unmatched category, so an unfamiliar or ambiguous name (a
 * regional game, a generic bucket like "بطاقات الألعاب") is left alone rather than
 * forced into a near-enough match. Only ever fills a *blank* image (see upsertCategory's
 * COALESCE) — never overrides a real one from the supplier or an admin.
 */
interface BrandHint {
  /** Substrings to match in the category name, checked in order — first hit wins. */
  keywords: string[];
  slug: string;
  color: string;
}

const BRAND_HINTS: BrandHint[] = [
  { keywords: ["نتفلكس"], slug: "netflix", color: "E50914" },
  { keywords: ["بلايستيشن", "بلاي ستيشن"], slug: "playstation", color: "0070D1" },
  { keywords: ["اكس بوكس", "إكس بوكس"], slug: "xbox", color: "107C10" },
  { keywords: ["ستيم"], slug: "steam", color: "1B2838" },
  { keywords: ["ايتونز", "آيتونز", "أيتونز"], slug: "itunes", color: "FB5BC5" },
  { keywords: ["أمازون", "امازون"], slug: "amazon", color: "FF9900" },
  { keywords: ["نينتيندو", "ننتيندو"], slug: "nintendoswitch", color: "E60012" },
  { keywords: ["روبلوكس"], slug: "roblox", color: "000000" },
  { keywords: ["USDT", "بينانس", "بينايس"], slug: "tether", color: "26A17B" },
  { keywords: ["ماين كرافت", "ماينكرافت"], slug: "minecraft", color: "62B47A" },
  { keywords: ["هواوي"], slug: "huawei", color: "FF0000" },
  { keywords: ["فالورانت", "فالورنت"], slug: "valorant", color: "FF4655" },
  { keywords: ["ريزر"], slug: "razer", color: "44D62C" },
];

export function matchBrandIcon(categoryName: string): string | null {
  for (const hint of BRAND_HINTS) {
    if (hint.keywords.some((kw) => categoryName.includes(kw))) {
      return `https://cdn.simpleicons.org/${hint.slug}/${hint.color}`;
    }
  }
  return null;
}
