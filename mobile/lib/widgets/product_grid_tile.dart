import 'package:flutter/material.dart';
import '../models/product.dart';
import '../theme/app_theme.dart';
import 'smart_network_image.dart';
import 'tap_scale.dart';

/// A 2-column grid card for a product — real cover art top, name, price, and a quick-buy
/// button — used on the category products screen. Distinct from [ProductTile] (a list
/// row) rather than a shared/parameterized widget: search results and favorites mix
/// products from different categories and lean on a subtitle line this grid has no room
/// for, so forcing one widget to do both layouts would make it worse at either.
class ProductGridTile extends StatelessWidget {
  const ProductGridTile({
    super.key,
    required this.product,
    required this.onTap,
    this.heroTag,
    this.isFavorite,
    this.onToggleFavorite,
    this.fallbackImage,
  });

  final StoreProduct product;
  final VoidCallback onTap;
  final Object? heroTag;
  final bool? isFavorite;
  final ValueChanged<bool>? onToggleFavorite;

  /// The category's own image (its platform's brand icon, for SMM/social-topup
  /// categories) — used when the product itself has none, e.g. Plus's SMM services never
  /// ship per-service art. Showing the platform logo is a real fact about the product
  /// (which platform it's for), not a stand-in for missing data.
  final String? fallbackImage;

  @override
  Widget build(BuildContext context) {
    final resolvedImage = product.image ?? fallbackImage;
    final image = resolvedImage == null
        ? _placeholder()
        : isBrandIconUrl(resolvedImage)
            // Same fix as the category grid: BrandIconBadge now paints its own full-bleed
            // brand-color background, so nothing else needs to fill this slot first.
            ? BrandIconBadge(resolvedImage)
            : SmartNetworkImage(resolvedImage, errorBuilder: (_, _, _) => _placeholder());

    return TapScale(
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                          child: heroTag != null ? Hero(tag: heroTag!, child: image) : image,
                        ),
                      ),
                      if (product.popular)
                        const Positioned(top: 6, right: 6, child: _CornerBadge()),
                      if (isFavorite != null)
                        Positioned(
                          top: 2,
                          left: 2,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(20),
                            onTap: () => onToggleFavorite?.call(!isFavorite!),
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.35), shape: BoxShape.circle),
                              child: Icon(
                                isFavorite! ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                                size: 16,
                                color: isFavorite! ? AppColors.danger : Colors.white,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(product.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Text(
                        product.pricePer1000
                            ? '${product.formattedPrice} ${product.currency}/1000'
                            : '${product.formattedPrice} ${product.currency}',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          color: AppColors.gold,
                        ),
                      ),
                    ),
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(color: AppColors.gold.withValues(alpha: 0.14), shape: BoxShape.circle),
                      child: const Icon(Icons.add_rounded, size: 18, color: AppColors.gold),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _placeholder() => Container(
        color: AppColors.darkSurfaceHigh.withValues(alpha: 0.4),
        child: const Icon(Icons.image_outlined, color: AppColors.textMuted),
      );
}

class _CornerBadge extends StatelessWidget {
  const _CornerBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(6)),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.local_fire_department_rounded, size: 11, color: Colors.white),
          SizedBox(width: 2),
          Text('الأكثر طلباً', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Colors.white)),
        ],
      ),
    );
  }
}
