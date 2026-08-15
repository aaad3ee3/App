import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/category.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/catalog_service.dart';
import '../../theme/app_theme.dart';
import 'category_products_screen.dart';

class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  late final CatalogService _catalogService;
  String _kind = 'giftcard';
  List<StoreCategory> _categories = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _catalogService = CatalogService(context.read<AuthStore>().api);
    _load();
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
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'giftcard', label: Text('بطاقات الألعاب'), icon: Icon(Icons.videogame_asset_outlined)),
              ButtonSegment(value: 'smm', label: Text('زيادة متابعين'), icon: Icon(Icons.trending_up_rounded)),
            ],
            selected: {_kind},
            onSelectionChanged: (s) => _switchKind(s.first),
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
          ],
        ),
      );
    }
    if (_categories.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _kind == 'giftcard' ? Icons.card_giftcard_rounded : Icons.trending_up_rounded,
              size: 52,
              color: AppColors.gold.withValues(alpha: 0.45),
            ),
            const SizedBox(height: 14),
            Text(
              'لا توجد فئات متاحة حالياً',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              'راجعنا قريباً — نضيف خدمات جديدة باستمرار',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
            ),
          ],
        ),
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
