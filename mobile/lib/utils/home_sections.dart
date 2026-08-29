import 'package:flutter/material.dart';
import '../models/category.dart';
import '../theme/app_theme.dart';

enum HomeSectionId { games, giftCards, liveApps }

/// One Home Dashboard grouping. The store's flat, ungrouped category list gets classified
/// into these three (see [classifyHomeSection]) the same way the backend already groups
/// flat categories into UI-facing brand icons and Plus sub-categories
/// (backend/src/modules/catalog/brand-icons.ts, plus-categorization.ts) — there is no
/// explicit "main section" field on the category itself to read this from instead.
class HomeSection {
  const HomeSection({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.gradient,
  });

  final HomeSectionId id;
  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> gradient;
}

const List<HomeSection> kHomeSections = [
  HomeSection(
    id: HomeSectionId.games,
    title: 'الألعاب',
    subtitle: 'شحن مباشر لأشهر المنصات والألعاب',
    icon: Icons.sports_esports_rounded,
    gradient: [Color(0xFF1B2A4A), AppColors.navy],
  ),
  HomeSection(
    id: HomeSectionId.giftCards,
    title: 'بطاقات هدايا واشتراكات',
    subtitle: 'نتفلكس وسبوتيفاي وبطاقات رقمية عالمية',
    icon: Icons.card_giftcard_rounded,
    gradient: [AppColors.goldDark, AppColors.gold],
  ),
  HomeSection(
    id: HomeSectionId.liveApps,
    title: 'شحن تطبيقات البث',
    subtitle: 'عملات ونقاط تطبيقات البث المباشر',
    icon: Icons.live_tv_rounded,
    gradient: [Color(0xFF3A1D5C), Color(0xFF6A2FBD)],
  ),
];

/// Every keyword here is lifted straight from the backend's own confirmed brand list
/// (backend/src/modules/catalog/brand-icons.ts's BRAND_HINTS) — real strings the backend
/// has already verified show up in real category names, not a guessed list.
const List<String> _giftCardKeywords = [
  'نتفلكس', 'netflix',
  'ايتونز', 'آيتونز', 'أيتونز', 'itunes',
  'أمازون', 'امازون', 'amazon',
  'جوجل بلاي', 'قوقل بلاي', 'google play',
  'سبوتيفاي', 'spotify',
  'أبل ميوزيك', 'ابل ميوزيك', 'آبل ميوزيك', 'apple music',
  'أتش بي أو ماكس', 'اتش بي او ماكس', 'hbo max',
  'نورد في بي ان', 'نورد في بي إن', 'nordvpn',
  'إكسبرس في بي إن', 'اكسبرس في بي ان', 'expressvpn',
  'سيرفشارك', 'سيرف شارك',
  'نوشن', 'notion',
  'كانفا', 'canva',
  'أدوبي', 'ادوبي', 'adobe',
  'تندر', 'tinder',
  'دولينجو', 'دوولينجو', 'duolingo',
  'كورسيرا', 'coursera',
  'يوديمي', 'udemy',
  'جرامرلي', 'grammarly',
  'كاب كت', 'كابكت', 'capcut',
  'بينانس', 'بينايس', 'binance', 'usdt',
  'هواوي', 'huawei',
  'أوبر', 'اوبر', 'uber',
];

/// social_topup categories are unconditionally "شحن تطبيقات البث" — Plus only sells
/// live-streaming coin top-ups under that kind, so no further keyword split is needed.
/// giftcard categories split by keyword: the curated, confirmed subscription/gift-card
/// names above are [HomeSectionId.giftCards]; everything else — platforms, consoles,
/// individual games — falls to [HomeSectionId.games], the default bucket.
HomeSectionId classifyHomeSection(StoreCategory category) {
  if (category.kind == 'social_topup') return HomeSectionId.liveApps;
  final normalized = category.name.toLowerCase();
  final isGiftCard = _giftCardKeywords.any((kw) => normalized.contains(kw.toLowerCase()));
  return isGiftCard ? HomeSectionId.giftCards : HomeSectionId.games;
}

class HomeSectionData {
  const HomeSectionData({required this.section, required this.categories});
  final HomeSection section;
  final List<StoreCategory> categories;
}

/// Groups a flat category list into dashboard sections, in [kHomeSections] order, and
/// drops any section that ends up with nothing in it — no empty banner ever renders.
/// Within a section, the categories with the most products lead, so the top-3 preview
/// grid always shows the shelf's best-stocked categories first.
List<HomeSectionData> buildHomeSections(List<StoreCategory> categories) {
  final grouped = <HomeSectionId, List<StoreCategory>>{
    for (final id in HomeSectionId.values) id: <StoreCategory>[],
  };
  for (final category in categories) {
    grouped[classifyHomeSection(category)]!.add(category);
  }
  return [
    for (final section in kHomeSections)
      if (grouped[section.id]!.isNotEmpty)
        HomeSectionData(
          section: section,
          categories: grouped[section.id]!..sort((a, b) => b.productCount.compareTo(a.productCount)),
        ),
  ];
}
