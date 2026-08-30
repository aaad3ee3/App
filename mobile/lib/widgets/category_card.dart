import 'package:flutter/material.dart';
import '../models/category.dart';
import '../screens/store/category_products_screen.dart';
import '../theme/app_theme.dart';
import 'smart_network_image.dart';
import 'tap_scale.dart';

IconData kindIcon(String kind) => switch (kind) {
      'giftcard' => Icons.card_giftcard_rounded,
      'social_topup' => Icons.live_tv_rounded,
      _ => Icons.trending_up_rounded,
    };

/// A single category tile for the store's 3-column grids — the flat kind-scoped grid
/// (الرشق tab), the Home Dashboard's top-3 preview grids, and each section's "عرض الكل"
/// full grid all render the exact same card, so a category looks identical everywhere it
/// shows up.
class CategoryCard extends StatelessWidget {
  const CategoryCard({super.key, required this.category});

  final StoreCategory category;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return TapScale(
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => CategoryProductsScreen(category: category)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                // A reference competitor app caps every category image with a glowing gold
                // lip instead of our old flat 2.5px divider line — the Stack lets that lip
                // (and the glow bleeding out from under it) overlap the image's own bottom
                // edge rather than just sit as a hairline seam between image and label.
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: Container(
                        // Supplier art arrives at wildly different sizes and backgrounds; a
                        // warm tint behind it keeps the grid looking even whether or not it
                        // loads.
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: isDark
                                ? [const Color(0xFF26344C), AppColors.darkSurface]
                                : [AppColors.creamLight, AppColors.cream.withValues(alpha: 0.55)],
                          ),
                        ),
                        child: category.image == null
                            ? _fallbackIcon()
                            : isBrandIconUrl(category.image!)
                                // BrandIconBadge paints its own full-bleed brand-color
                                // background (the tint behind it exists only for the
                                // real-photo branch below), giving the tile the same bold
                                // color-block look a reference competitor app uses for
                                // these exact platforms.
                                ? BrandIconBadge(category.image!)
                                : SmartNetworkImage(
                                    category.image!,
                                    fit: BoxFit.cover,
                                    width: double.infinity,
                                    height: double.infinity,
                                    errorBuilder: (_, _, _) => _fallbackIcon(),
                                    loadingBuilder: (context, child, progress) => progress == null
                                        ? child
                                        : const Center(
                                            child: SizedBox(
                                              width: 20,
                                              height: 20,
                                              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.gold),
                                            ),
                                          ),
                                  ),
                      ),
                    ),
                    // Gold glow bleeding out from under the lip — a shadow with no visible
                    // fill of its own, so it reads as light spilling out rather than a
                    // second bar stacked on the real one.
                    Positioned(
                      left: 14,
                      right: 14,
                      bottom: -3,
                      child: Container(
                        height: 10,
                        decoration: BoxDecoration(
                          boxShadow: [
                            BoxShadow(color: AppColors.gold.withValues(alpha: 0.6), blurRadius: 14, spreadRadius: 1),
                          ],
                        ),
                      ),
                    ),
                    // The gold lip itself, capping the image's bottom edge.
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: Container(
                        height: 9,
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [AppColors.goldLight, AppColors.gold],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(6, 7, 6, 8),
                child: Column(
                  children: [
                    Text(
                      category.name,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                    ),
                    // Tells the customer there is something behind the tile before they
                    // spend a tap finding out. Hidden at zero rather than showing "0
                    // منتج", which advertises an empty shelf.
                    if (category.productCount > 0) ...[
                      const SizedBox(height: 3),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.grid_view_rounded, color: AppColors.gold, size: 10),
                          const SizedBox(width: 4),
                          Text(
                            '${category.productCount} منتج',
                            style: TextStyle(fontSize: 10, color: Theme.of(context).colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _fallbackIcon() => Center(
        child: Icon(kindIcon(category.kind), size: 32, color: AppColors.gold.withValues(alpha: 0.6)),
      );
}
