import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../models/category.dart';
import '../screens/store/category_products_screen.dart';
import '../theme/app_theme.dart';
import '../utils/home_sections.dart';
import 'category_card.dart';
import 'sayeh_logo.dart';
import 'smart_network_image.dart';
import 'tap_scale.dart';

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
                Positioned(top: 12, right: 38, child: _FloatBadge(item: items[0], seed: 0)),
                if (items.length > 1) Positioned(bottom: 12, left: 34, child: _FloatBadge(item: items[1], seed: 1)),
                if (items.length > 2) Positioned(top: 16, left: 14, child: _FloatBadge(item: items[2], seed: 2)),
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
}

/// One orbiting badge. Each instance runs its own independent, endlessly-reversing
/// float+tilt loop (a different duration/delay/tilt direction per [seed], the same trick
/// the reference CSS used — two elements on different keyframe timings so they never
/// drift in sync and look mechanical).
class _FloatBadge extends StatelessWidget {
  const _FloatBadge({required this.item, required this.seed});

  final SpotlightItem item;
  final int seed;

  @override
  Widget build(BuildContext context) {
    final duration = Duration(milliseconds: 3200 + seed * 500);
    final delay = Duration(milliseconds: seed * 250);
    final rotateBegin = seed.isEven ? -0.035 : 0.02;
    final rotateEnd = seed.isEven ? -0.01 : 0.055;

    return TapScale(
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => CategoryProductsScreen(category: item.category)),
          ),
          child: Container(
            width: 54,
            height: 54,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            child: _BadgeArt(category: item.category),
          ),
        ),
      ),
    )
        .animate(onPlay: (controller) => controller.repeat(reverse: true), delay: delay)
        .moveY(begin: 0, end: -10, duration: duration, curve: Curves.easeInOut)
        .rotate(begin: rotateBegin, end: rotateEnd, duration: duration, curve: Curves.easeInOut);
  }
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
