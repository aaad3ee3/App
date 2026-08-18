import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/category.dart';
import '../../models/search_result.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/catalog_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/product_tile.dart';
import 'category_products_screen.dart';
import 'giftcard_purchase_screen.dart';
import 'smm_purchase_screen.dart';

class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  /// Long enough that a customer typing a word does not fire a request per letter, short
  /// enough that results feel like they are keeping up.
  static const Duration _debounce = Duration(milliseconds: 350);

  /// One character matches far too much to be worth a round trip.
  static const int _minQueryLength = 2;

  late final CatalogService _catalogService;
  final _searchController = TextEditingController();
  Timer? _debounceTimer;

  String _kind = 'giftcard';
  List<StoreCategory> _categories = [];
  bool _loading = true;
  String? _error;

  String _query = '';
  List<CatalogSearchResult> _results = [];
  bool _searching = false;
  String? _searchError;

  /// Guards against out-of-order responses: a slow request for "ببج" must not overwrite
  /// the results of the later "ببجي" the customer has already finished typing.
  int _searchSeq = 0;

  @override
  void initState() {
    super.initState();
    _catalogService = CatalogService(context.read<AuthStore>().api);
    _load();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final categories = await _catalogService.getCategories(kind: _kind);
      if (!mounted) return;
      setState(() {
        _categories = categories;
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

  void _switchKind(String kind) {
    if (kind == _kind) return;
    setState(() => _kind = kind);
    _load();
    // The tab scopes search too, so an open query has to be re-run against the new one.
    if (_isSearching) _runSearch(_query);
  }

  bool get _isSearching => _query.trim().length >= _minQueryLength;

  void _onQueryChanged(String value) {
    setState(() => _query = value);
    _debounceTimer?.cancel();
    if (!_isSearching) {
      setState(() {
        _results = [];
        _searching = false;
        _searchError = null;
      });
      return;
    }
    _debounceTimer = Timer(_debounce, () => _runSearch(value));
  }

  Future<void> _runSearch(String query) async {
    final seq = ++_searchSeq;
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final results = await _catalogService.search(query.trim(), kind: _kind);
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _results = results;
        _searching = false;
      });
    } on ApiException catch (e) {
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _searchError = e.message;
        _searching = false;
      });
    }
  }

  void _clearSearch() {
    _debounceTimer?.cancel();
    _searchController.clear();
    setState(() {
      _query = '';
      _results = [];
      _searching = false;
      _searchError = null;
    });
  }

  void _openResult(CatalogSearchResult result) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => result.category.isGiftcard
            ? GiftcardPurchaseScreen(product: result.product)
            : SmmPurchaseScreen(product: result.product),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: TextField(
            controller: _searchController,
            onChanged: _onQueryChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              isDense: true,
              hintText: 'ابحث عن بطاقة أو خدمة…',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              suffixIcon: _query.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close_rounded, size: 18),
                      tooltip: 'مسح',
                      onPressed: _clearSearch,
                    ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'giftcard', label: Text('بطاقات الألعاب'), icon: Icon(Icons.videogame_asset_outlined)),
              ButtonSegment(value: 'smm', label: Text('زيادة متابعين'), icon: Icon(Icons.trending_up_rounded)),
            ],
            selected: {_kind},
            onSelectionChanged: (s) => _switchKind(s.first),
          ),
        ),
        Expanded(child: _isSearching ? _buildSearchResults() : _buildCategories()),
      ],
    );
  }

  Widget _buildSearchResults() {
    if (_searching && _results.isEmpty) return const Center(child: CircularProgressIndicator());

    if (_searchError != null) {
      return _CenteredMessage(
        icon: Icons.wifi_off_rounded,
        title: _searchError!,
        action: OutlinedButton(
          onPressed: () => _runSearch(_query),
          child: const Text('إعادة المحاولة'),
        ),
      );
    }

    if (_results.isEmpty) {
      return _CenteredMessage(
        icon: Icons.search_off_rounded,
        title: 'لا توجد نتائج لـ "${_query.trim()}"',
        subtitle: 'جرّب كلمة أخرى، أو تصفّح الفئات',
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _results.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) => ProductTile(
        product: _results[index].product,
        // The category is what makes a result readable: "60 UC" on its own says nothing.
        subtitle: _results[index].category.name,
        onTap: () => _openResult(_results[index]),
      ),
    );
  }

  Widget _buildCategories() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return _CenteredMessage(
        icon: Icons.wifi_off_rounded,
        title: _error!,
        action: OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
      );
    }
    if (_categories.isEmpty) {
      return _CenteredMessage(
        icon: _kind == 'giftcard' ? Icons.card_giftcard_rounded : Icons.trending_up_rounded,
        title: 'لا توجد فئات متاحة حالياً',
        subtitle: 'راجعنا قريباً — نضيف خدمات جديدة باستمرار',
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.95,
        ),
        itemCount: _categories.length,
        itemBuilder: (context, index) => _CategoryCard(category: _categories[index]),
      ),
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({required this.icon, required this.title, this.subtitle, this.action});

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 52, color: AppColors.gold.withValues(alpha: 0.45)),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
              ),
            ],
            if (action != null) ...[const SizedBox(height: 14), action!],
          ],
        ),
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.category});

  final StoreCategory category;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Card(
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
                child: category.image != null
                    ? Padding(
                        padding: const EdgeInsets.all(12),
                        child: Image.network(
                          category.image!,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) => _fallbackIcon(context),
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
                      )
                    : _fallbackIcon(context),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 11, 10, 12),
              child: Text(
                category.name,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fallbackIcon(BuildContext context) => Center(
        child: Icon(
          category.isGiftcard ? Icons.card_giftcard_rounded : Icons.trending_up_rounded,
          size: 40,
          color: AppColors.gold.withValues(alpha: 0.6),
        ),
      );
}
