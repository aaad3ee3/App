import 'package:flutter/material.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:provider/provider.dart';
import '../../models/search_result.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/favorites_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/product_tile.dart';
import '../../widgets/shimmer_box.dart';
import 'giftcard_purchase_screen.dart';
import 'smm_purchase_screen.dart';

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  late final FavoritesService _favoritesService;
  List<CatalogSearchResult> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _favoritesService = FavoritesService(context.read<AuthStore>().api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _favoritesService.list();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _remove(CatalogSearchResult item) async {
    final previous = _items;
    setState(() => _items = _items.where((i) => i.product.id != item.product.id).toList());
    try {
      await _favoritesService.remove(item.product.id);
    } on ApiException {
      if (!mounted) return;
      setState(() => _items = previous);
    }
  }

  void _open(CatalogSearchResult item) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => item.category.isGiftcard
            ? GiftcardPurchaseScreen(product: item.product)
            : SmmPurchaseScreen(product: item.product),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('المفضلة')),
      body: _loading
          ? const ListRowSkeleton()
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
                    ],
                  ),
                )
              : _items.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.favorite_border_rounded, size: 56, color: AppColors.gold.withValues(alpha: 0.45)),
                            const SizedBox(height: 16),
                            const Text('ما ضفت شيء للمفضلة بعد', style: TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            Text(
                              'اضغط على أيقونة القلب على أي منتج عشان تحفظه هنا',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13.5),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: AnimationLimiter(
                        child: ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _items.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (context, index) => AnimationConfiguration.staggeredList(
                            position: index,
                            duration: const Duration(milliseconds: 380),
                            child: SlideAnimation(
                              verticalOffset: 30,
                              curve: Curves.easeOutCubic,
                              child: FadeInAnimation(
                                child: ProductTile(
                                  product: _items[index].product,
                                  subtitle: _items[index].category.name,
                                  onTap: () => _open(_items[index]),
                                  isFavorite: true,
                                  onToggleFavorite: (_) => _remove(_items[index]),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
    );
  }
}
