import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../models/category.dart';
import '../screens/store/category_products_screen.dart';
import '../theme/app_theme.dart';
import '../utils/home_sections.dart';
import 'category_card.dart';
import 'orbit_badge.dart';
import 'sayeh_logo.dart';
import 'smart_network_image.dart';

class SpotlightItem {
  const SpotlightItem({required this.section, required this.category});
  final HomeSection section;
  final StoreCategory category;
}

/// The Home Dashboard's top strip: the Sayeh mark at rest in the middle, with real top
/// categories (one per section — the same data the old swipeable "تسوق الآن" cards used)
/// orbiting it as small badges that float and tilt on an endless loop. Replaces that
/// carousel per direct feedback that its cards read as generic/cheap; the continuous
/// float-in-place — via flutter_animate's onPlay: (c) => c.repeat(reverse: true) — is the
/// same idea as a reference "welcome" screen's layered floating badges, adapted to real
/// catalog art instead of decoration.
class FloatingHero extends StatelessWidget {
  const FloatingHero({super.key, required this.items});

  final List<SpotlightItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      height: 176,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: isDark ? [AppColors.navyDark, AppColors.navy] : [AppColors.creamLight, AppColors.cream],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.18)),
      ),
      child: Column(
        children: [
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 68,
                  height: 68,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.gold.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: AppColors.gold.withValues(alpha: 0.28), blurRadius: 28, spreadRadius: 4)],
                  ),
                  child: const SayehLogo(size: 36),
                ),
                Positioned(top: 12, right: 38, child: _orbitFor(context, items[0], 0)),
                if (items.length > 1) Positioned(bottom: 12, left: 34, child: _orbitFor(context, items[1], 1)),
                if (items.length > 2) Positioned(top: 16, left: 14, child: _orbitFor(context, items[2], 2)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'أفضل الفئات عندنا الآن',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
                color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _orbitFor(BuildContext context, SpotlightItem item, int seed) => OrbitBadge(
        seed: seed,
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => CategoryProductsScreen(category: item.category)),
        ),
        child: _BadgeArt(category: item.category),
      );
}

class _BadgeArt extends StatelessWidget {
  const _BadgeArt({required this.category});

  final StoreCategory category;

  @override
  Widget build(BuildContext context) {
    if (category.image == null) {
      return Icon(kindIcon(category.kind), color: AppColors.navy.withValues(alpha: 0.6), size: 22);
    }
    if (isBrandIconUrl(category.image!)) {
      // No BrandIconBadge here — this badge's own white circle already does that job;
      // stacking a second one inside it would just draw a smaller circle on a circle.
      return SvgPicture.network(
        category.image!,
        fit: BoxFit.contain,
        placeholderBuilder: (_) => const SizedBox.shrink(),
        errorBuilder: (_, _, _) => Icon(kindIcon(category.kind), color: AppColors.navy.withValues(alpha: 0.6), size: 22),
      );
    }
    return ClipOval(
      child: SmartNetworkImage(
        category.image!,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(kindIcon(category.kind), color: AppColors.navy.withValues(alpha: 0.6), size: 22),
      ),
    );
  }
}
