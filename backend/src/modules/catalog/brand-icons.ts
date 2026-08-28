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
  // Batch below confirmed the same way — a real Simple Icons slug looked up against
  // their published list, not guessed — after the customer complaint that too many
  // categories showed no logo at all.
  { keywords: ["جوجل بلاي", "قوقل بلاي"], slug: "googleplay", color: "01875F" },
  { keywords: ["سبوتيفاي"], slug: "spotify", color: "1DB954" },
  { keywords: ["إيبك جيمز", "ايبك جيمز", "إبيك جيمز"], slug: "epicgames", color: "313131" },
  { keywords: ["أوريجن", "اوريجن", "إي ايه سبورتس", "اي ايه سبورتس"], slug: "ea", color: "000000" },
  { keywords: ["يوبيسوفت", "يوبي سوفت"], slug: "ubisoft", color: "000000" },
  { keywords: ["كرانشي رول", "كرانش رول"], slug: "crunchyroll", color: "F47521" },
  { keywords: ["ليج أوف ليجيندز", "ليق اوف ليجيندز", "ريوت بوينتس", "ريوت"], slug: "leagueoflegends", color: "C28F2C" },
  { keywords: ["باتل نت", "بليزرد"], slug: "battledotnet", color: "148EFF" },
  { keywords: ["فورتنايت", "فورت نايت"], slug: "fortnite", color: "000000" },
  { keywords: ["ببجي"], slug: "pubg", color: "F2A900" },
  { keywords: ["كول أوف ديوتي", "كول اوف ديوتي", "كود موبايل"], slug: "callofduty", color: "000000" },
  { keywords: ["جينشين امباكت", "جينشن امباكت", "جينشين إمباكت"], slug: "genshinimpact", color: "1F8FCD" },
  { keywords: ["كونتر سترايك", "كاونتر سترايك", "سي اس جو"], slug: "counterstrike", color: "F2A900" },
  { keywords: ["أوبر", "اوبر"], slug: "uber", color: "000000" },
  // Second batch — same "real Simple Icons slug, checked against their published list"
  // rule, added after a customer complaint that most category tiles still show no logo
  // (digital-goods/subscription categories weren't covered by the first batch at all).
  { keywords: ["تيك توك", "تيكتوك"], slug: "tiktok", color: "000000" },
  { keywords: ["سناب شات", "سناب"], slug: "snapchat", color: "FFFC00" },
  { keywords: ["يوتيوب"], slug: "youtube", color: "FF0000" },
  { keywords: ["ديسكورد", "دسكورد"], slug: "discord", color: "5865F2" },
  { keywords: ["تويتش"], slug: "twitch", color: "9146FF" },
  { keywords: ["أبل ميوزيك", "ابل ميوزيك", "آبل ميوزيك"], slug: "applemusic", color: "FA243C" },
  { keywords: ["أتش بي أو ماكس", "اتش بي او ماكس", "HBO Max", "ماكس"], slug: "hbomax", color: "002BE7" },
  { keywords: ["نورد في بي ان", "نورد في بي إن", "NordVPN"], slug: "nordvpn", color: "4687FF" },
  { keywords: ["إكسبرس في بي إن", "اكسبرس في بي ان", "ExpressVPN"], slug: "expressvpn", color: "DA3940" },
  { keywords: ["سيرفشارك", "سيرف شارك"], slug: "surfshark", color: "1EBFBF" },
  { keywords: ["نوشن", "Notion"], slug: "notion", color: "000000" },
  { keywords: ["كانفا"], slug: "canva", color: "00C4CC" },
  { keywords: ["أدوبي", "ادوبي"], slug: "adobe", color: "FF0000" },
  { keywords: ["تندر"], slug: "tinder", color: "FE3C72" },
  { keywords: ["دولينجو", "دوولينجو"], slug: "duolingo", color: "58CC02" },
  { keywords: ["كورسيرا"], slug: "coursera", color: "0056D2" },
  { keywords: ["يوديمي"], slug: "udemy", color: "A435F0" },
  { keywords: ["جرامرلي"], slug: "grammarly", color: "15C39A" },
  { keywords: ["كاب كت", "كابكت"], slug: "capcut", color: "000000" },
];

export function matchBrandIcon(categoryName: string): string | null {
  for (const hint of BRAND_HINTS) {
    if (hint.keywords.some((kw) => categoryName.includes(kw))) {
      return `https://cdn.simpleicons.org/${hint.slug}/${hint.color}`;
    }
  }
  return null;
}
