import 'dart:async';

import 'package:flutter/material.dart';
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
import '../../widgets/product_tile.dart';
import '../../widgets/shimmer_box.dart';
import '../../widgets/tap_scale.dart';
import 'category_products_screen.dart';
import 'giftcard_purchase_screen.dart';
import 'smm_purchase_screen.dart';
import 'social_topup_purchase_screen.dart';
import '../topup/topup_screen.dart';

IconData _kindIcon(String kind) => switch (kind) {
      'giftcard' => Icons.card_giftcard_rounded,
      'social_topup' => Icons.live_tv_rounded,
      _ => Icons.trending_up_rounded,
    };

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
                  ButtonSegment(value: 'smm', label: Text('الرشق'), icon: Icon(Icons.trending_up_rounded)),
                  ButtonSegment(value: 'social_topup', label: Text('شحن بث'), icon: Icon(Icons.live_tv_rounded)),
                ],
                selected: {_kind},
                onSelectionChanged: (s) => _switchKind(s.first),
              ),
            ),
            // Only shown on the browse view — a banner above a search results list reads as
            // noise between the customer and the thing they're actively looking for.
            if (!_isSearching)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: _PromoBanner(kind: _kind),
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
            right: 16,
            bottom: 14,
            child: _FloatingBalanceChip(balance: _walletBalance!, onTopUp: _goToTopup),
          ),
      ],
    );
  }

  Widget _buildSearchResults() {
    if (_searching && _results.isEmpty) return const ListRowSkeleton();

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
      return _CenteredMessage(
        icon: Icons.wifi_off_rounded,
        title: _error!,
        action: OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
      );
    }
    if (_categories.isEmpty) {
      return _CenteredMessage(
        icon: _kindIcon(_kind),
        title: 'لا توجد فئات متاحة حالياً',
        subtitle: 'راجعنا قريباً — نضيف خدمات جديدة باستمرار',
      );
    }

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
                child: _CategoryCard(category: _categories[index]),
              ),
            ),
          ),
        ),
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

class _PromoSlide {
  const _PromoSlide({required this.title, required this.subtitle, required this.icon});
  final String title;
  final String subtitle;
  final IconData icon;
}

/// A brand-colored strip above the category grid — the browse view otherwise opens
/// straight into a search field and a grid, which reads as bare next to a home screen
/// with any promotional content on it. Built from the existing palette and icons rather
/// than illustration assets, so there's nothing here that can fail to load. Auto-advances
/// through a short rotation of messages rather than showing just one, the same way a
/// storefront's own promotional space rarely sits on a single static message.
class _PromoBanner extends StatefulWidget {
  const _PromoBanner({required this.kind});

  final String kind;

  @override
  State<_PromoBanner> createState() => _PromoBannerState();
}

class _PromoBannerState extends State<_PromoBanner> {
  static const _interval = Duration(seconds: 4);
  final _controller = PageController();
  Timer? _timer;
  int _page = 0;

  List<_PromoSlide> get _slides => switch (widget.kind) {
        'giftcard' => const [
            _PromoSlide(title: 'شحن فوري لأشهر الألعاب', subtitle: 'أسعار بالدينار الليبي، يوصلك خلال دقائق', icon: Icons.card_giftcard_rounded),
            _PromoSlide(title: 'ادعُ صديق واكسب رصيد', subtitle: 'شارك كود الإحالة من حسابك واكسبوا رصيد مجاني سوا', icon: Icons.card_giftcard_rounded),
            _PromoSlide(title: 'محفظتك دايم جاهزة', subtitle: 'اشحن رصيدك مرة واشتري بضغطة وحدة في أي وقت', icon: Icons.card_giftcard_rounded),
          ],
        'social_topup' => const [
            _PromoSlide(title: 'شحن برامج البث المباشر', subtitle: 'أزال لايف، بارتي ستار، imo وغيرها — شحن مباشر لحسابك', icon: Icons.live_tv_rounded),
            _PromoSlide(title: 'ادعُ صديق واكسب رصيد', subtitle: 'شارك كود الإحالة من حسابك واكسبوا رصيد مجاني سوا', icon: Icons.live_tv_rounded),
            _PromoSlide(title: 'شحن آمن وموثوق', subtitle: 'يبدأ التنفيذ تلقائياً بعد التأكيد', icon: Icons.live_tv_rounded),
          ],
        _ => const [
            _PromoSlide(title: 'الرشق — متابعين حقيقيين', subtitle: 'يبدأ التنفيذ مباشرة بعد التأكيد', icon: Icons.rocket_launch_rounded),
            _PromoSlide(title: 'ادعُ صديق واكسب رصيد', subtitle: 'شارك كود الإحالة من حسابك واكسبوا رصيد مجاني سوا', icon: Icons.rocket_launch_rounded),
            _PromoSlide(title: 'تنفيذ آمن وسريع', subtitle: 'خدماتنا موثوقة وأسعارها بالدينار الليبي', icon: Icons.rocket_launch_rounded),
          ],
      };

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(_interval, (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_page + 1) % _slides.length;
      _controller.animateToPage(next, duration: const Duration(milliseconds: 450), curve: Curves.easeOutCubic);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  static const _bannerGradients = {
    'giftcard': [AppColors.navy, AppColors.navyLight],
    'social_topup': [AppColors.info, Color(0xFF6B8FC7)],
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        gradient: LinearGradient(
          begin: Alignment.centerRight,
          end: Alignment.centerLeft,
          colors: _bannerGradients[widget.kind] ?? [AppColors.goldDark, AppColors.gold],
        ),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 52,
            child: PageView.builder(
              controller: _controller,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, index) {
                final slide = _slides[index];
                return Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            slide.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15.5),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            slide.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.16),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(slide.icon, color: Colors.white, size: 22),
                    ),
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              _slides.length,
              (i) => AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 2.5),
                width: i == _page ? 14 : 5,
                height: 5,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: i == _page ? 0.95 : 0.4),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          ),
        ],
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
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.navy,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(color: AppColors.navy.withValues(alpha: 0.32), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.account_balance_wallet_rounded, color: AppColors.goldLight, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'رصيدك: ${balance.amount.toStringAsFixed(2)} ${balance.currency}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13.5),
            ),
          ),
          TapScale(
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: onTopUp,
              child: Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle),
                child: const Icon(Icons.add_rounded, color: Colors.white, size: 22),
              ),
            ),
          ),
        ],
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
                child: category.image != null
                    ? Image.network(
                        category.image!,
                        // Full-bleed rather than contained-with-padding: a small square
                        // brand icon (Simple Icons) or Libya Play's own rectangular game
                        // art both end up looking like an afterthought floating in a
                        // corner under `contain` + padding, which is what made the grid
                        // look unfinished. `cover` fills the tile edge-to-edge like every
                        // competitor's store grid does, cropping rather than shrinking.
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
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
                      )
                    : _fallbackIcon(context),
              ),
            ),
            // A thin accent line between image and label — the small seam a dense grid of
            // otherwise-plain rectangles needs to read as designed rather than default.
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
                  // spend a tap finding out. Hidden at zero rather than showing "0 منتج",
                  // which advertises an empty shelf.
                  if (category.productCount > 0) ...[
                    const SizedBox(height: 2),
                    Text(
                      '${category.productCount} منتج',
                      style: TextStyle(
                        fontSize: 10,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
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

  Widget _fallbackIcon(BuildContext context) => Center(
        child: Icon(
          _kindIcon(category.kind),
          size: 32,
          color: AppColors.gold.withValues(alpha: 0.6),
        ),
      );
}
