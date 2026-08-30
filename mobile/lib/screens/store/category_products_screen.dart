import 'package:flutter/material.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:provider/provider.dart';
import '../../models/category.dart';
import '../../models/product.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/catalog_service.dart';
import '../../services/favorites_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/arabic_text.dart';
import '../../utils/smm_service_types.dart';
import '../../widgets/product_grid_tile.dart';
import '../../widgets/shimmer_box.dart';
import '../../widgets/smart_network_image.dart';
import 'giftcard_purchase_screen.dart';
import 'smm_purchase_screen.dart';
import 'social_topup_purchase_screen.dart';

/// How a category's products are ordered. Cheapest-first is the default because that is
/// the question customers actually ask of a list of top-up amounts.
enum ProductSort { priceAsc, priceDesc, name }

class CategoryProductsScreen extends StatefulWidget {
  const CategoryProductsScreen({super.key, required this.category});

  final StoreCategory category;

  @override
  State<CategoryProductsScreen> createState() => _CategoryProductsScreenState();
}

class _CategoryProductsScreenState extends State<CategoryProductsScreen> {
  late final CatalogService _catalogService;
  late final FavoritesService _favoritesService;
  final _filterController = TextEditingController();
  List<StoreProduct> _products = [];
  Set<String> _favoriteIds = {};
  ProductSort _sort = ProductSort.priceAsc;
  String _filter = '';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthStore>().api;
    _catalogService = CatalogService(api);
    _favoritesService = FavoritesService(api);
    _load();
  }

  @override
  void dispose() {
    _filterController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final isGuest = context.read<AuthStore>().isGuest;
      final products = await _catalogService.getProducts(widget.category.id);
      // Best-effort: a favorites lookup failure should never block browsing products.
      final favoriteIds = isGuest ? <String>{} : await _favoritesService.listIds().catchError((_) => <String>{});
      if (!mounted) return;
      setState(() {
        _products = products;
        _favoriteIds = favoriteIds;
        _loading = false;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _toggleFavorite(StoreProduct product, bool favorite) async {
    setState(() {
      if (favorite) {
        _favoriteIds = {..._favoriteIds, product.id};
      } else {
        _favoriteIds = {..._favoriteIds}..remove(product.id);
      }
    });
    try {
      if (favorite) {
        await _favoritesService.add(product.id);
      } else {
        await _favoritesService.remove(product.id);
      }
    } on ApiException {
      if (!mounted) return;
      // Roll back on failure — the star otherwise silently lies about saved state.
      setState(() {
        if (favorite) {
          _favoriteIds = {..._favoriteIds}..remove(product.id);
        } else {
          _favoriteIds = {..._favoriteIds, product.id};
        }
      });
    }
  }

  /// Filtering and sorting happen on the device: the whole category is already loaded, so
  /// a round trip per keystroke would only add latency to a list of a few dozen rows.
  List<StoreProduct> get _visibleProducts {
    final filtered = _filter.trim().isEmpty
        ? List<StoreProduct>.from(_products)
        : _products.where((p) => matchesSearch(p.name, _filter)).toList();

    filtered.sort(switch (_sort) {
      ProductSort.priceAsc => (a, b) => a.priceValue.compareTo(b.priceValue),
      ProductSort.priceDesc => (a, b) => b.priceValue.compareTo(a.priceValue),
      ProductSort.name => (a, b) => a.name.compareTo(b.name),
    });
    return filtered;
  }

  void _openProduct(StoreProduct product) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => _purchaseScreen(product)));
  }

  Widget _purchaseScreen(StoreProduct product) {
    if (widget.category.isGiftcard) return GiftcardPurchaseScreen(product: product, heroTag: 'product-image-${product.id}');
    if (widget.category.isSocialTopup) return SocialTopupPurchaseScreen(product: product);
    return SmmPurchaseScreen(product: product);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.category.name)),
      body: Column(
        children: [
          // Only when the category actually has a real photo — an empty gradient box
          // for the many categories that don't would just be dead space up top.
          if (widget.category.image != null) _CategoryHero(imageUrl: widget.category.image!),
          Expanded(
            child: _loading
                ? const ListRowSkeleton()
                : _error != null
                    ? _ErrorState(message: _error!, onRetry: _load)
                    : Column(
                        children: [
                          // Hidden for short lists — a search box above four items is clutter.
                          if (_products.length > 6) _buildControls(context),
                          Expanded(child: _buildList()),
                        ],
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildControls(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _filterController,
              onChanged: (value) => setState(() => _filter = value),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                isDense: true,
                hintText: 'ابحث داخل ${widget.category.name}',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                suffixIcon: _filter.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close_rounded, size: 18),
                        tooltip: 'مسح',
                        onPressed: () {
                          _filterController.clear();
                          setState(() => _filter = '');
                        },
                      ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          PopupMenuButton<ProductSort>(
            initialValue: _sort,
            tooltip: 'الترتيب',
            icon: const Icon(Icons.swap_vert_rounded),
            onSelected: (value) => setState(() => _sort = value),
            itemBuilder: (_) => const [
              PopupMenuItem(value: ProductSort.priceAsc, child: Text('الأرخص أولاً')),
              PopupMenuItem(value: ProductSort.priceDesc, child: Text('الأغلى أولاً')),
              PopupMenuItem(value: ProductSort.name, child: Text('حسب الاسم')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    final products = _visibleProducts;

    if (products.isEmpty) {
      return Center(
        child: Text(
          _filter.trim().isEmpty ? 'لا توجد منتجات متاحة' : 'لا توجد نتائج لـ "${_filter.trim()}"',
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      );
    }

    // الرشق (SMM) categories are one platform with dozens of unrelated service types
    // (followers, views, likes, ...) all encoded only in the name — a flat list sorted by
    // price alone mixes them together and reads as random. Every other kind (gift cards,
    // live-app top-ups) is already a coherent, single-purpose list, so it keeps the plain
    // grid. Grouping is skipped when a platform only has one real type in stock (e.g. a
    // brand-new or thin category) — a single section header with nothing to contrast
    // against would just be clutter.
    if (widget.category.isSmm) {
      final grouped = _groupByServiceType(products);
      if (grouped.values.where((items) => items.isNotEmpty).length > 1) {
        return _buildGroupedList(grouped);
      }
    }

    return _buildFlatGrid(products);
  }

  Map<SmmServiceKind, List<StoreProduct>> _groupByServiceType(List<StoreProduct> products) {
    final grouped = <SmmServiceKind, List<StoreProduct>>{for (final type in kSmmServiceTypes) type.kind: []};
    for (final product in products) {
      grouped[classifySmmServiceKind(product.name)]!.add(product);
    }
    return grouped;
  }

  Widget _buildGroupedList(Map<SmmServiceKind, List<StoreProduct>> grouped) {
    final sections = [
      for (final type in kSmmServiceTypes)
        if (grouped[type.kind]!.isNotEmpty) MapEntry(type, grouped[type.kind]!),
    ];

    return RefreshIndicator(
      onRefresh: _load,
      child: CustomScrollView(
        slivers: [
          for (final entry in sections) ...[
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              sliver: SliverToBoxAdapter(child: _ServiceTypeHeader(type: entry.key, count: entry.value.length)),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 0.68,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, index) => _productTile(entry.value[index]),
                  childCount: entry.value.length,
                ),
              ),
            ),
          ],
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
        ],
      ),
    );
  }

  Widget _buildFlatGrid(List<StoreProduct> products) {
    return RefreshIndicator(
      onRefresh: _load,
      child: AnimationLimiter(
        child: GridView.builder(
          padding: const EdgeInsets.all(16),
          // Taller than square (0.68) rather than matching the image's own 1:1 ratio —
          // real product photos plus a name and price row need more vertical room than
          // just the image, unlike a generic icon.
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 0.68,
          ),
          itemCount: products.length,
          itemBuilder: (context, index) => AnimationConfiguration.staggeredGrid(
            position: index,
            duration: const Duration(milliseconds: 380),
            columnCount: 2,
            child: SlideAnimation(
              verticalOffset: 30,
              curve: Curves.easeOutCubic,
              child: FadeInAnimation(child: _productTile(products[index])),
            ),
          ),
        ),
      ),
    );
  }

  Widget _productTile(StoreProduct product) {
    final isGuest = context.watch<AuthStore>().isGuest;
    return ProductGridTile(
      product: product,
      onTap: () => _openProduct(product),
      heroTag: 'product-image-${product.id}',
      fallbackImage: widget.category.image,
      isFavorite: isGuest ? null : _favoriteIds.contains(product.id),
      onToggleFavorite: isGuest ? null : (value) => _toggleFavorite(product, value),
    );
  }
}

/// A grouped section's title within a الرشق (SMM) category screen — just a label and
/// count, not a tappable "view all": this is already the full list for that service type,
/// there is nowhere further to go.
class _ServiceTypeHeader extends StatelessWidget {
  const _ServiceTypeHeader({required this.type, required this.count});

  final SmmServiceType type;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(color: AppColors.gold.withValues(alpha: 0.14), shape: BoxShape.circle),
          child: Icon(type.icon, size: 17, color: AppColors.gold),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(type.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        ),
        Text('$count', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('إعادة المحاولة')),
        ],
      ),
    );
  }
}

/// The category's own cover photo as a short rounded-bottom strip above the grid — real
/// art the store already has, not a generic banner, so this only renders when the
/// category actually carries an image (see build() above).
class _CategoryHero extends StatelessWidget {
  const _CategoryHero({required this.imageUrl});

  final String imageUrl;

  @override
  Widget build(BuildContext context) {
    // BrandIconBadge now paints its own full-bleed brand-color background (real brand
    // color, not a guess — see its own doc comment), so this strip just clips it to shape.
    if (isBrandIconUrl(imageUrl)) {
      return SizedBox(
        height: 130,
        width: double.infinity,
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
          child: BrandIconBadge(imageUrl),
        ),
      );
    }

    return SizedBox(
      height: 130,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
        child: Stack(
          fit: StackFit.expand,
          children: [
            SmartNetworkImage(
              imageUrl,
              errorBuilder: (_, _, _) => Container(color: AppColors.darkSurfaceHigh),
            ),
            // A bottom-up fade rather than a flat tint — keeps the photo readable at the
            // top while still guaranteeing contrast for anything placed over the bottom
            // edge (nothing today, but matches the treatment on the store's own banners).
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black38],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
