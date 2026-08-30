import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../models/category.dart';
import '../screens/store/category_products_screen.dart';
import '../theme/app_theme.dart';
import '../utils/home_sections.dart';
import 'category_card.dart';
import 'orbit_badge.dart';
import 'smart_network_image.dart';

class SpotlightItem {
  const SpotlightItem({required this.section, required this.category});
  final HomeSection section;
  final StoreCategory category;
}

/// The Home Dashboard's top strip: real top categories (one per section — the same data
/// the old swipeable "تسوق الآن" cards used) as large badges that float and tilt on an
/// endless loop. Originally orbited a center Sayeh-mark circle; dropped per direct
/// feedback that the cluster read as unreadable, clipped rectangles — three plain badges,
/// sized up to actually be visible, replaced it.
class FloatingHero extends StatelessWidget {
  const FloatingHero({super.key, required this.items});

  final List<SpotlightItem> items;

  static const _badgeSize = 88.0;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // A slight vertical stagger per badge (not a rigid aligned row) so the cluster still
    // reads as loosely floating rather than a mechanical grid.
    const topOffsets = [0.0, 14.0, 6.0];

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
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (int i = 0; i < items.length; i++)
                  Padding(
                    padding: EdgeInsets.only(top: topOffsets[i % topOffsets.length]),
                    child: _orbitFor(context, items[i], i),
                  ),
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
        size: _badgeSize,
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
      return Icon(kindIcon(category.kind), color: AppColors.navy.withValues(alpha: 0.6), size: 36);
    }
    if (isBrandIconUrl(category.image!)) {
      // No BrandIconBadge here — this badge's own white circle already does that job;
      // stacking a second one inside it would just draw a smaller circle on a circle.
      return SvgPicture.network(
        category.image!,
        fit: BoxFit.contain,
        placeholderBuilder: (_) => const SizedBox.shrink(),
        errorBuilder: (_, _, _) => Icon(kindIcon(category.kind), color: AppColors.navy.withValues(alpha: 0.6), size: 36),
      );
    }
    return ClipOval(
      child: SmartNetworkImage(
        category.image!,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(kindIcon(category.kind), color: AppColors.navy.withValues(alpha: 0.6), size: 36),
      ),
    );
  }
}
