import 'package:flutter/material.dart';
import '../models/category.dart';

/// The Home Dashboard hero used to spotlight each section's own top-stocked category
/// (games/gift-cards/live-apps); replaced per direct request with three specific,
/// always-the-same brands instead — PlayStation, PUBG, and Xbox, in that display order
/// (PUBG and Xbox flank PlayStation, which sits in the visually featured center slot).
/// Colors/slugs are the same real, confirmed Simple Icons values already used by the
/// backend's own brand-icons.ts, not guessed.
class FeaturedBrand {
  const FeaturedBrand({required this.keywords, required this.label, required this.iconSlug, required this.color});

  final List<String> keywords;
  final String label;
  final String iconSlug;
  final Color color;
}

const List<FeaturedBrand> kFeaturedBrands = [
  FeaturedBrand(keywords: ['ببجي', 'pubg'], label: 'ببجي', iconSlug: 'pubg', color: Color(0xFFF2A900)),
  FeaturedBrand(
    keywords: ['بلايستيشن', 'بلاي ستيشن', 'playstation', 'psn'],
    label: 'بلايستيشن',
    iconSlug: 'playstation',
    color: Color(0xFF0070D1),
  ),
  FeaturedBrand(keywords: ['اكس بوكس', 'إكس بوكس', 'xbox'], label: 'إكس بوكس', iconSlug: 'xbox', color: Color(0xFF107C10)),
];

class FeaturedCategory {
  const FeaturedCategory({required this.brand, required this.category});
  final FeaturedBrand brand;
  final StoreCategory category;
}

/// Matches each [kFeaturedBrands] entry against the real, currently-in-stock category
/// list by name keyword — the same technique catalog/brand-icons.ts already uses on the
/// backend. A brand with no matching category (out of stock, or Libya Play renamed it)
/// is silently dropped rather than shown with a fabricated placeholder; the hero itself
/// hides entirely if none match at all.
List<FeaturedCategory> pickFeaturedCategories(List<StoreCategory> categories) {
  final result = <FeaturedCategory>[];
  for (final brand in kFeaturedBrands) {
    for (final category in categories) {
      final normalized = category.name.toLowerCase();
      if (brand.keywords.any((kw) => normalized.contains(kw.toLowerCase()))) {
        result.add(FeaturedCategory(brand: brand, category: category));
        break;
      }
    }
  }
  return result;
}
