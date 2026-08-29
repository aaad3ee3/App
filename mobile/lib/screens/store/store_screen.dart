import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:provider/provider.dart';
import '../../models/category.dart';
import '../../models/product.dart';
import '../../models/search_result.dart';
import '../../models/wallet.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/catalog_service.dart';
import '../../services/wallet_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/home_sections.dart';
import '../../widgets/category_card.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/product_tile.dart';
import '../../widgets/section_banner.dart';
import '../../widgets/shimmer_box.dart';
import '../../widgets/tap_scale.dart';
import 'giftcard_purchase_screen.dart';
import 'section_categories_screen.dart';
import 'smm_purchase_screen.dart';
import 'social_topup_purchase_screen.dart';
import '../topup/topup_screen.dart';

class StoreScreen extends StatefulWidget {
  const StoreScreen({
    super.key,
    this.kinds = const ['giftcard', 'smm', 'social_topup'],
    this.initialKind = 'giftcard',
  });

  /// Which store kinds this instance switches between — a single-entry list hides the
  /// segmented control entirely, letting الرشق live as its own bottom-nav tab (see
  /// home_shell.dart) rather than a segment buried inside المتجر.
  final List<String> kinds;
  final String initialKind;

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
  final _searchFocusNode = FocusNode();
  Timer? _debounceTimer;

  // Collapsed by default: a full-width bar sitting under the title before there is
  // anything to search reads as bare next to a competitor's compact search icon. Starts
  // open only if a query is already live (e.g. returning to this tab mid-search).
  bool _searchOpen = false;

  late String _kind = widget.initialKind;

  /// The main "المتجر" tab passes more than one kind (giftcard + social_topup) so it can
  /// render the Home Dashboard's sectioned layout across both at once; every other
  /// instance (e.g. الرشق's own tab) passes exactly one kind and keeps the plain flat grid.
  bool get _isDashboard => widget.kinds.length > 1;

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

  WalletBalance? _walletBalance;

  @override
  void initState() {
    super.initState();
    _catalogService = CatalogService(context.read<AuthStore>().api);
    _load();
    _loadWalletBalance();
  }

  /// Best-effort: shown as a small floating chip while browsing so the customer never has
  /// to leave the store to check what they can afford — the same "balance always visible"
  /// pattern Libya Play keeps on screen. Silently absent for guests (no wallet) or on any
  /// fetch failure, since it's a convenience overlay, not the source of truth for a
  /// purchase (giftcard/smm_purchase_screen fetch their own balance for that).
  Future<void> _loadWalletBalance() async {
    final auth = context.read<AuthStore>();
    if (auth.isGuest) return;
    try {
      final balance = await WalletService(auth.api).getBalance();
      if (mounted) setState(() => _walletBalance = balance);
    } on ApiException {
      // Stays null — the chip just doesn't show.
    }
  }

  Future<void> _goToTopup() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TopupScreen()));
    _loadWalletBalance();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _openSearch() {
    setState(() => _searchOpen = true);
    // Requested after the field actually exists in the tree — a focus request on the
    // same frame it's built would be a no-op.
    WidgetsBinding.instance.addPostFrameCallback((_) => _searchFocusNode.requestFocus());
  }

  void _closeSearch() {
    setState(() => _searchOpen = false);
    _clearSearch();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // No kind filter in dashboard mode: one request covers both giftcard and
      // social_topup, then classifyHomeSection sorts the results into sections client-side.
      // Filtered against widget.kinds afterward since an unfiltered fetch would also
      // include smm — الرشق has its own tab and must not bleed into this one.
      final categories = _isDashboard
          ? (await _catalogService.getCategories()).where((c) => widget.kinds.contains(c.kind)).toList()
          : await _catalogService.getCategories(kind: _kind);
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
      List<CatalogSearchResult> results;
      if (_isDashboard) {
        // One search per kind rather than an unscoped one: an unscoped search would also
        // reach into smm's results, which الرشق's own tab owns.
        final perKind = await Future.wait(widget.kinds.map((k) => _catalogService.search(query.trim(), kind: k)));
        results = perKind.expand((r) => r).toList();
      } else {
        results = await _catalogService.search(query.trim(), kind: _kind);
      }
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
      MaterialPageRoute(builder: (_) => _purchaseScreenFor(result.category, result.product)),
    );
  }

  Widget _purchaseScreenFor(StoreCategory category, StoreProduct product) {
    if (category.isGiftcard) return GiftcardPurchaseScreen(product: product, heroTag: 'product-image-${product.id}');
    if (category.isSocialTopup) return SocialTopupPurchaseScreen(product: product);
    return SmmPurchaseScreen(product: product);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Column(
          children: [
            // Collapsed to a small icon by default — a full-width bar left open with
            // nothing typed in it is dead space above the grid on every visit. Since the
            // app is RTL, the icon being the last child in this Row is what puts it on the
            // physical left edge, not a directional property on the Row itself.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  if (_searchOpen)
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        focusNode: _searchFocusNode,
                        onChanged: _onQueryChanged,
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          isDense: true,
                          hintText: 'ابحث عن بطاقة أو خدمة…',
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        ),
                      ),
                    )
                  else
                    const Spacer(),
                  const SizedBox(width: 8),
                  IconButton.filledTonal(
                    tooltip: _searchOpen ? 'إغلاق البحث' : 'بحث',
                    iconSize: 18,
                    visualDensity: VisualDensity.compact,
                    onPressed: _searchOpen ? _closeSearch : _openSearch,
                    icon: Icon(_searchOpen ? Icons.close_rounded : Icons.search_rounded),
                  ),
                ],
              ),
            ),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 260),
                switchInCurve: Curves.easeOut,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, animation) => FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                    position: Tween<Offset>(begin: const Offset(0, 0.03), end: Offset.zero).animate(animation),
                    child: child,
                  ),
                ),
                child: KeyedSubtree(
                  key: ValueKey(_isSearching ? 'search' : 'categories-$_kind'),
                  child: _isSearching ? _buildSearchResults() : _buildCategories(),
                ),
              ),
            ),
          ],
        ),
        if (_walletBalance != null)
          Positioned(
            left: 16,
            bottom: 14,
            child: _FloatingBalanceChip(balance: _walletBalance!, onTopUp: _goToTopup)
                .animate()
                .fadeIn(duration: 320.ms)
                .scale(begin: const Offset(0.7, 0.7), curve: Curves.easeOutBack, duration: 360.ms),
          ),
      ],
    );
  }

  Widget _buildSearchResults() {
    if (_searching && _results.isEmpty) return const ListRowSkeleton();

    if (_searchError != null) {
      return EmptyState(
        icon: Icons.wifi_off_rounded,
        title: _searchError!,
        action: OutlinedButton(
          onPressed: () => _runSearch(_query),
          child: const Text('إعادة المحاولة'),
        ),
      );
    }

    if (_results.isEmpty) {
      return EmptyState(
        icon: Icons.search_off_rounded,
        title: 'لا توجد نتائج لـ "${_query.trim()}"',
        subtitle: 'جرّب كلمة أخرى، أو تصفّح الفئات',
        lottieAsset: 'assets/lottie/empty_box.json',
      );
    }

    return AnimationLimiter(
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 84),
        itemCount: _results.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) => AnimationConfiguration.staggeredList(
          position: index,
          duration: const Duration(milliseconds: 380),
          child: SlideAnimation(
            verticalOffset: 30,
            curve: Curves.easeOutCubic,
            child: FadeInAnimation(
              child: ProductTile(
                product: _results[index].product,
                // The category is what makes a result readable: "60 UC" alone says nothing.
                subtitle: _results[index].category.name,
                heroTag: 'product-image-${_results[index].product.id}',
                onTap: () => _openResult(_results[index]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCategories() {
    if (_loading) return const CategoryGridSkeleton();
    if (_error != null) {
      return EmptyState(
        icon: Icons.wifi_off_rounded,
        title: _error!,
        action: OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
      );
    }
    if (_categories.isEmpty) {
      return EmptyState(
        icon: kindIcon(_kind),
        title: 'لا توجد فئات متاحة حالياً',
        subtitle: 'راجعنا قريباً — نضيف خدمات جديدة باستمرار',
        lottieAsset: 'assets/lottie/empty_box.json',
      );
    }

    if (_isDashboard) return _buildDashboardSections();

    return RefreshIndicator(
      onRefresh: _load,
      child: AnimationLimiter(
        child: GridView.builder(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 84),
          // Three columns, denser than before — more of the catalog visible at a glance
          // without scrolling, the same density a competitor's storefront grid uses.
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 0.72,
          ),
          itemCount: _categories.length,
          itemBuilder: (context, index) => AnimationConfiguration.staggeredGrid(
            position: index,
            duration: const Duration(milliseconds: 380),
            columnCount: 3,
            child: SlideAnimation(
              verticalOffset: 30,
              curve: Curves.easeOutCubic,
              child: FadeInAnimation(
                child: CategoryCard(category: _categories[index]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// The Home Dashboard layout: one banner + top-3 grid + "عرض الكل" bar per non-empty
  /// section, in place of the single flat grid every other store tab still uses.
  Widget _buildDashboardSections() {
    final sections = buildHomeSections(_categories);
    return RefreshIndicator(
      onRefresh: _load,
      child: AnimationLimiter(
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 84),
          itemCount: sections.length,
          itemBuilder: (context, index) => AnimationConfiguration.staggeredList(
            position: index,
            duration: const Duration(milliseconds: 380),
            child: SlideAnimation(
              verticalOffset: 30,
              curve: Curves.easeOutCubic,
              child: FadeInAnimation(
                child: Padding(
                  padding: EdgeInsets.only(bottom: index == sections.length - 1 ? 0 : 22),
                  child: _HomeSectionBlock(data: sections[index]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Keeps the wallet balance on screen while browsing, with one tap straight to top-up —
/// the customer never has to leave the store just to check what they can afford, or to
/// go find the wallet tab when they can't.
class _FloatingBalanceChip extends StatelessWidget {
  const _FloatingBalanceChip({required this.balance, required this.onTopUp});

  final WalletBalance balance;
  final VoidCallback onTopUp;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Small and sized to its content — not a bar stretching edge to edge. Only left+bottom
    // are given in the Positioned above, so this Row must never rely on Expanded (an
    // unconstrained-width parent) — mainAxisSize.min keeps it hugging its own content.
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 7, 6, 7),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.navy,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(color: AppColors.navy.withValues(alpha: 0.32), blurRadius: 12, offset: const Offset(0, 4)),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.account_balance_wallet_rounded, color: AppColors.goldLight, size: 16),
          const SizedBox(width: 6),
          Text(
            '${balance.amount.toStringAsFixed(2)} ${balance.currency}',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
          ),
          const SizedBox(width: 6),
          TapScale(
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: onTopUp,
              child: Container(
                width: 26,
                height: 26,
                decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle),
                child: const Icon(Icons.add_rounded, color: Colors.white, size: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One Home Dashboard section: its banner, a top-3 preview grid of its best-stocked
/// categories, and — only when the section has more than 3 — a bar down to the rest.
class _HomeSectionBlock extends StatelessWidget {
  const _HomeSectionBlock({required this.data});

  final HomeSectionData data;

  static const _previewCount = 3;

  void _openViewAll(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => SectionCategoriesScreen(section: data.section, categories: data.categories)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final preview = data.categories.take(_previewCount).toList();
    final remaining = data.categories.length - preview.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionBanner(section: data.section, onViewAll: () => _openViewAll(context)),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 3,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 0.72,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [for (final category in preview) CategoryCard(category: category)],
        ),
        if (remaining > 0) ...[
          const SizedBox(height: 10),
          _ViewAllBar(label: '+$remaining فئة أخرى', onTap: () => _openViewAll(context)),
        ],
      ],
    );
  }
}

/// The bottom bar under a section's preview grid — the rest of a section's categories are
/// one tap away rather than pushed into an ever-taller home screen.
class _ViewAllBar extends StatelessWidget {
  const _ViewAllBar({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return TapScale(
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceHigh : AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.gold.withValues(alpha: 0.25)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
                const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('عرض الكل', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.gold)),
                    SizedBox(width: 2),
                    Icon(Icons.chevron_left_rounded, size: 16, color: AppColors.gold),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
