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
/// endless loop. Went through two revisions per direct feedback: first a center
/// Sayeh-mark circle with the badges orbiting it (read as unreadable, clipped rectangles),
/// then three plain white circles (read as unclear once real category art — a mix of tall
/// logos and busy backgrounds — sat directly on them). Each badge is now a squircle framed
/// in its own section's color with a clean white art well inside, so which of the three
/// sections it belongs to is visible at a glance instead of three unlabeled circles.
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
        shape: BoxShape.rectangle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: item.section.gradient,
        ),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => CategoryProductsScreen(category: item.category)),
        ),
        child: _BadgeArt(category: item.category, section: item.section),
      );
}

/// Real category art (a mix of tall brand logos and square icons, several with busy or
/// low-contrast backgrounds) sat directly on a plain white circle before — legible for a
/// clean square icon like PlayStation's, but muddy for anything less flat. A white,
/// rounded art well inside the badge's own section-colored frame gives every image the
/// same clean backdrop regardless of what it looks like, and the small corner chip spells
/// out which of the three sections (games / gift cards / live apps) the badge belongs to
/// — the actual "تقسيم صح" fix, not just three unlabeled circles side by side.
class _BadgeArt extends StatelessWidget {
  const _BadgeArt({required this.category, required this.section});

  final StoreCategory category;
  final HomeSection section;

  @override
  Widget build(BuildContext context) {
    final accent = section.gradient.last;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned.fill(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: ColoredBox(
              color: Colors.white,
              child: Padding(padding: const EdgeInsets.all(8), child: _art(accent)),
            ),
          ),
        ),
        Positioned(
          bottom: 4,
          right: 4,
          child: Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: accent, width: 1.5)),
            child: Icon(section.icon, size: 11, color: accent),
          ),
        ),
      ],
    );
  }

  Widget _art(Color accent) {
    if (category.image == null) {
      return Center(child: Icon(kindIcon(category.kind), color: accent, size: 30));
    }
    if (isBrandIconUrl(category.image!)) {
      // No BrandIconBadge here — the white art well behind it already does that job;
      // stacking a second one inside it would just draw a badge on a badge.
      return SvgPicture.network(
        category.image!,
        fit: BoxFit.contain,
        placeholderBuilder: (_) => const SizedBox.shrink(),
        errorBuilder: (_, _, _) => Center(child: Icon(kindIcon(category.kind), color: accent, size: 30)),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SmartNetworkImage(
        category.image!,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Center(child: Icon(kindIcon(category.kind), color: accent, size: 30)),
      ),
    );
  }
}
