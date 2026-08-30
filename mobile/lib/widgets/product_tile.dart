import 'package:flutter/material.dart';
import '../models/product.dart';
import '../theme/app_theme.dart';
import 'smart_network_image.dart';
import 'tap_scale.dart';

/// One row in a product list. Shared by the category listing, search results and the
/// favorites list so a product looks and reads the same wherever the customer runs into it.
class ProductTile extends StatelessWidget {
  const ProductTile({
    super.key,
    required this.product,
    required this.onTap,
    this.subtitle,
    this.heroTag,
    this.isFavorite,
    this.onToggleFavorite,
  });

  final StoreProduct product;
  final VoidCallback onTap;

  /// Shown under the name — the category, in search results, where the product name
  /// alone ("60 UC") does not say what game it belongs to.
  final String? subtitle;

  /// When set, the thumbnail participates in a Hero transition into the purchase screen.
  /// Left null for lists a product can appear in more than once at a time (search results
  /// next to the category grid) — a duplicate Hero tag on screen crashes the animation.
  final Object? heroTag;

  /// Null hides the star entirely (e.g. no signed-in customer to own a favorites list).
  final bool? isFavorite;
  final ValueChanged<bool>? onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final image = product.image == null
        ? _placeholder(context)
        : isBrandIconUrl(product.image!)
            ? BrandIconBadge(product.image!)
            : SmartNetworkImage(product.image!, errorBuilder: (_, _, _) => _placeholder(context));

    return TapScale(
      child: Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: SizedBox(
                    width: 56,
                    height: 56,
                    child: heroTag != null ? Hero(tag: heroTag!, child: image) : image,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (subtitle != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                      if (product.popular) ...[
                        const SizedBox(height: 4),
                        const _PopularBadge(),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      // The per-1000 suffix comes from the product itself rather than the
                      // screen it is shown on: a search result mixes both kinds in one list.
                      product.pricePer1000
                          ? '${product.formattedPrice} ${product.currency}/1000'
                          : '${product.formattedPrice} ${product.currency}',
                      style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.primary),
                    ),
                    if (isFavorite != null) ...[
                      const SizedBox(height: 2),
                      InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => onToggleFavorite?.call(!isFavorite!),
                        child: Padding(
                          padding: const EdgeInsets.all(4),
                          child: Icon(
                            isFavorite! ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                            size: 19,
                            color: isFavorite! ? AppColors.danger : theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _placeholder(BuildContext context) => Container(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        child: Icon(Icons.image_outlined, color: Colors.grey.shade500),
      );
}

class _PopularBadge extends StatelessWidget {
  const _PopularBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.gold.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.local_fire_department_rounded, size: 12, color: AppColors.goldDark),
          SizedBox(width: 3),
          Text(
            'الأكثر طلباً',
            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.goldDark),
          ),
        ],
      ),
    );
  }
}
