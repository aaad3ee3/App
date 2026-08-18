import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/category.dart';
import '../../models/product.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/catalog_service.dart';
import '../../utils/arabic_text.dart';
import '../../widgets/product_tile.dart';
import 'giftcard_purchase_screen.dart';
import 'smm_purchase_screen.dart';

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
  final _filterController = TextEditingController();
  List<StoreProduct> _products = [];
  ProductSort _sort = ProductSort.priceAsc;
  String _filter = '';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _catalogService = CatalogService(context.read<AuthStore>().api);
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
      final products = await _catalogService.getProducts(widget.category.id);
      if (!mounted) return;
      setState(() {
        _products = products;
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
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => widget.category.isGiftcard
            ? GiftcardPurchaseScreen(product: product)
            : SmmPurchaseScreen(product: product),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.category.name)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : Column(
                  children: [
                    // Hidden for short lists — a search box above four items is clutter.
                    if (_products.length > 6) _buildControls(context),
                    Expanded(child: _buildList()),
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

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: products.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) => ProductTile(
          product: products[index],
          onTap: () => _openProduct(products[index]),
        ),
      ),
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
