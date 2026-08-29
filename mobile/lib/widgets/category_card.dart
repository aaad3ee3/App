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
                child: Container(
                  // Supplier art arrives at wildly different sizes and backgrounds; a warm
                  // tint behind it keeps the grid looking even whether or not it loads.
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
                          // A brand's flat single-color glyph (several are literally black)
                          // reads as washed-out or vanishes outright when stretched
                          // full-bleed over this gradient the way a real photo is — a
                          // fixed near-white badge guarantees contrast regardless of theme
                          // or brand color.
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
              // A thin accent line between image and label — the small seam a dense grid
              // of otherwise-plain rectangles needs to read as designed rather than default.
              Container(height: 2.5, color: AppColors.gold.withValues(alpha: 0.55)),
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
                      const SizedBox(height: 2),
                      Text(
                        '${category.productCount} منتج',
                        style: TextStyle(fontSize: 10, color: Theme.of(context).colorScheme.onSurfaceVariant),
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
