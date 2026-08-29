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

// Keyword matching is case-insensitive (see matchBrandIcon), so English keywords below
// are written lowercase purely for readability — they'd match any casing regardless.
const BRAND_HINTS: BrandHint[] = [
  { keywords: ["نتفلكس", "netflix"], slug: "netflix", color: "E50914" },
  { keywords: ["بلايستيشن", "بلاي ستيشن", "playstation", "psn"], slug: "playstation", color: "0070D1" },
  // Confirmed real gap: Libya Play (and most Libyan resellers) often keep Western brand
  // names in Latin script even inside an otherwise-Arabic category list — "Xbox" plain,
  // not "اكس بوكس" — so an Arabic-only keyword list silently missed exactly these.
  { keywords: ["اكس بوكس", "إكس بوكس", "xbox"], slug: "xbox", color: "107C10" },
  { keywords: ["ستيم", "steam"], slug: "steam", color: "1B2838" },
  // "apple" deliberately excluded — too broad, would shadow the later, more specific
  // Apple Music entry (e.g. a literal "Apple Music" category would wrongly hit this first).
  { keywords: ["ايتونز", "آيتونز", "أيتونز", "itunes"], slug: "itunes", color: "FB5BC5" },
  { keywords: ["أمازون", "امازون", "amazon"], slug: "amazon", color: "FF9900" },
  { keywords: ["نينتيندو", "ننتيندو", "nintendo"], slug: "nintendoswitch", color: "E60012" },
  { keywords: ["روبلوكس", "roblox"], slug: "roblox", color: "000000" },
  { keywords: ["USDT", "بينانس", "بينايس", "binance"], slug: "tether", color: "26A17B" },
  { keywords: ["ماين كرافت", "ماينكرافت", "minecraft"], slug: "minecraft", color: "62B47A" },
  { keywords: ["هواوي", "huawei"], slug: "huawei", color: "FF0000" },
  { keywords: ["فالورانت", "فالورنت", "valorant"], slug: "valorant", color: "FF4655" },
  { keywords: ["ريزر", "razer"], slug: "razer", color: "44D62C" },
  // Batch below confirmed the same way — a real Simple Icons slug looked up against
  // their published list, not guessed — after the customer complaint that too many
  // categories showed no logo at all.
  { keywords: ["جوجل بلاي", "قوقل بلاي", "google play"], slug: "googleplay", color: "01875F" },
  { keywords: ["سبوتيفاي", "spotify"], slug: "spotify", color: "1DB954" },
  { keywords: ["إيبك جيمز", "ايبك جيمز", "إبيك جيمز", "epic games"], slug: "epicgames", color: "313131" },
  { keywords: ["أوريجن", "اوريجن", "إي ايه سبورتس", "اي ايه سبورتس", "origin", "ea sports"], slug: "ea", color: "000000" },
  { keywords: ["يوبيسوفت", "يوبي سوفت", "ubisoft"], slug: "ubisoft", color: "000000" },
  { keywords: ["كرانشي رول", "كرانش رول", "crunchyroll"], slug: "crunchyroll", color: "F47521" },
  { keywords: ["ليج أوف ليجيندز", "ليق اوف ليجيندز", "ريوت بوينتس", "ريوت", "league of legends", "riot"], slug: "leagueoflegends", color: "C28F2C" },
  { keywords: ["باتل نت", "بليزرد", "battle.net", "blizzard"], slug: "battledotnet", color: "148EFF" },
  { keywords: ["فورتنايت", "فورت نايت", "fortnite"], slug: "fortnite", color: "000000" },
  { keywords: ["ببجي", "pubg"], slug: "pubg", color: "F2A900" },
  { keywords: ["كول أوف ديوتي", "كول اوف ديوتي", "كود موبايل", "call of duty"], slug: "callofduty", color: "000000" },
  { keywords: ["جينشين امباكت", "جينشن امباكت", "جينشين إمباكت", "genshin"], slug: "genshinimpact", color: "1F8FCD" },
  { keywords: ["كونتر سترايك", "كاونتر سترايك", "سي اس جو", "counter strike", "csgo"], slug: "counterstrike", color: "F2A900" },
  { keywords: ["أوبر", "اوبر", "uber"], slug: "uber", color: "000000" },
  // Second batch — same "real Simple Icons slug, checked against their published list"
  // rule, added after a customer complaint that most category tiles still show no logo
  // (digital-goods/subscription categories weren't covered by the first batch at all).
  { keywords: ["تيك توك", "تيكتوك", "tiktok"], slug: "tiktok", color: "000000" },
  { keywords: ["سناب شات", "سناب", "snapchat"], slug: "snapchat", color: "FFFC00" },
  { keywords: ["يوتيوب", "youtube"], slug: "youtube", color: "FF0000" },
  { keywords: ["ديسكورد", "دسكورد", "discord"], slug: "discord", color: "5865F2" },
  { keywords: ["تويتش", "twitch"], slug: "twitch", color: "9146FF" },
  { keywords: ["أبل ميوزيك", "ابل ميوزيك", "آبل ميوزيك", "apple music"], slug: "applemusic", color: "FA243C" },
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
  // Case-insensitive: Libya Play sends some Western brand names in Latin script with
  // inconsistent casing ("Xbox", "XBOX", "xbox"), and Arabic text is unaffected by
  // lowercasing either way, so this is a strict improvement for every keyword above.
  const normalized = categoryName.toLowerCase();
  for (const hint of BRAND_HINTS) {
    if (hint.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
      return `https://cdn.simpleicons.org/${hint.slug}/${hint.color}`;
    }
  }
  return null;
}
