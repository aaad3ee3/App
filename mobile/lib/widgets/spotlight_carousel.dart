import 'dart:async';

import 'package:flutter/material.dart';
import '../models/category.dart';
import '../screens/store/category_products_screen.dart';
import '../theme/app_theme.dart';
import '../utils/home_sections.dart';
import 'category_card.dart';
import 'smart_network_image.dart';
import 'tap_scale.dart';

class SpotlightItem {
  const SpotlightItem({required this.section, required this.category});
  final HomeSection section;
  final StoreCategory category;
}

/// The Home Dashboard's top strip — an auto-advancing spotlight of each section's own
/// best-stocked category, real data pulled straight from [buildHomeSections] rather than
/// a fabricated promo image, filling what would otherwise be dead space above the section
/// list (the same slot Libya Play's own home screen gives to its rotating hero banner).
class SpotlightCarousel extends StatefulWidget {
  const SpotlightCarousel({super.key, required this.items});

  final List<SpotlightItem> items;

  @override
  State<SpotlightCarousel> createState() => _SpotlightCarouselState();
}

class _SpotlightCarouselState extends State<SpotlightCarousel> {
  final _controller = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    // A single item has nowhere to advance to — no point running a timer that would just
    // re-animate the same page onto itself every few seconds.
    if (widget.items.length > 1) {
      _timer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!mounted) return;
        final next = (_page + 1) % widget.items.length;
        _controller.animateToPage(next, duration: const Duration(milliseconds: 420), curve: Curves.easeOutCubic);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return const SizedBox.shrink();

    return Column(
      children: [
        SizedBox(
          height: 128,
          child: PageView.builder(
            controller: _controller,
            onPageChanged: (i) => setState(() => _page = i),
            itemCount: widget.items.length,
            itemBuilder: (context, index) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: _SpotlightCard(item: widget.items[index]),
            ),
          ),
        ),
        if (widget.items.length > 1) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (int i = 0; i < widget.items.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: i == _page ? 18 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: i == _page ? AppColors.gold : AppColors.gold.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _SpotlightCard extends StatelessWidget {
  const _SpotlightCard({required this.item});

  final SpotlightItem item;

  @override
  Widget build(BuildContext context) {
    final category = item.category;
    return TapScale(
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => CategoryProductsScreen(category: category)),
          ),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topRight, end: Alignment.bottomLeft, colors: item.section.gradient),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(item.section.icon, color: Colors.white.withValues(alpha: 0.85), size: 14),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              item.section.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        category.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                      ),
                      if (category.productCount > 0) ...[
                        const SizedBox(height: 4),
                        Text(
                          '${category.productCount} منتج متاح',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11.5),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(10)),
                        child: const Text('تسوق الآن', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11.5)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _SpotlightArt(category: category),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SpotlightArt extends StatelessWidget {
  const _SpotlightArt({required this.category});

  final StoreCategory category;

  static const _size = 76.0;

  @override
  Widget build(BuildContext context) {
    if (category.image == null) {
      return Icon(kindIcon(category.kind), color: Colors.white.withValues(alpha: 0.5), size: 44);
    }
    if (isBrandIconUrl(category.image!)) {
      return BrandIconBadge(category.image!, size: _size, padding: 16);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SmartNetworkImage(
        category.image!,
        width: _size,
        height: _size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(kindIcon(category.kind), color: Colors.white.withValues(alpha: 0.5), size: 44),
      ),
    );
  }
}
