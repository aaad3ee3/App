import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
import '../utils/refresh_controller.dart';
import '../widgets/ambient_glow.dart';
import '../widgets/floating_nav_bar.dart';
import '../widgets/sayeh_logo.dart';
import '../widgets/sign_in_gate.dart';
import 'profile_screen.dart';
import 'store/orders_history_screen.dart';
import 'store/store_screen.dart';
import 'wallet/wallet_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  StreamSubscription<RemoteMessage>? _pushSubscription;

  // Store first, deliberately. The wallet used to open the app, which put the plumbing
  // in front of the product — a customer opens this app to buy something, not to look at
  // a balance. Orders get their own tab for the same reason they do in every store app:
  // "where is my code" is the single most repeated question, and it was buried two taps
  // deep inside the profile. الرشق gets promoted to its own tab, right after المتجر —
  // it was a segment buried inside the store screen, easy to miss entirely.
  static const _titles = ['المتجر', 'الرشق', 'طلباتي', 'المحفظة', 'حسابي'];

  // Lets the AppBar's own search icon open the dashboard tab's search field directly
  // instead of that tab keeping a second, always-visible search icon of its own right
  // under the AppBar — see StoreSearchController in store_screen.dart.
  final _storeSearchController = StoreSearchController();

  // Every tab below stays alive for the whole session in the IndexedStack further down —
  // switching tabs never rebuilds them, so none of their initState-only fetches ever rerun
  // on their own. That's invisible until money moves through a *different* tab than the
  // one you're looking at: buy something from المتجر/الرشق, then check طلباتي or المحفظة,
  // and both would otherwise still show whatever they loaded before the purchase — the
  // order looks like it never went through and the balance looks like it was never
  // charged, even though the backend processed both correctly (see RefreshController's own
  // doc comment). One controller per tab that actually shows money or order state; _onTabSelected
  // below calls .refresh() on whichever one the customer just switched to.
  final _storeBalanceRefresh = RefreshController();
  final _smmBalanceRefresh = RefreshController();
  final _ordersRefresh = RefreshController();
  final _walletRefresh = RefreshController();

  // The store is the one tab a visitor gets in full — everything else is about *their*
  // money and *their* orders, which needs an account to even mean anything.
  late final _pages = [
    StoreScreen(
      kinds: const ['giftcard', 'social_topup'],
      searchController: _storeSearchController,
      balanceRefreshController: _storeBalanceRefresh,
    ),
    StoreScreen(kinds: const ['smm'], initialKind: 'smm', balanceRefreshController: _smmBalanceRefresh),
    RequiresAccount(
      gate: SignInGate(
        icon: Icons.receipt_long_rounded,
        title: 'طلباتك تبان هنا',
        message: 'أنشئ حساب عشان تشتري وتتابع طلباتك وتلقى أكوادك محفوظة في أي وقت.',
      ),
      child: OrdersHistoryScreen(embedded: true, refreshController: _ordersRefresh),
    ),
    RequiresAccount(
      gate: SignInGate(
        icon: Icons.account_balance_wallet_rounded,
        title: 'محفظتك',
        message: 'أنشئ حساب عشان تشحن رصيدك بليبيانا وتشتري بضغطة وحدة.',
      ),
      child: WalletScreen(refreshController: _walletRefresh),
    ),
    RequiresAccount(
      gate: SignInGate(
        icon: Icons.person_rounded,
        title: 'حسابك',
        message: 'سجّل دخولك عشان توصل لبياناتك وطلباتك وإعداداتك.',
      ),
      child: ProfileScreen(),
    ),
  ];

  void _onTabSelected(int index) {
    setState(() => _index = index);
    switch (index) {
      case 0:
        _storeBalanceRefresh.refresh();
        break;
      case 1:
        _smmBalanceRefresh.refresh();
        break;
      case 2:
        _ordersRefresh.refresh();
        break;
      case 3:
        _walletRefresh.refresh();
        break;
    }
  }

  @override
  void initState() {
    super.initState();
    // A notification that arrives while the app is open is NOT shown by the system on
    // Android, so without this the user sees nothing — which matters most for exactly
    // the messages they are waiting on ("your card is ready", "your wallet was topped
    // up") while staring at the app.
    _pushSubscription = context.read<AuthStore>().push.onForegroundMessage.listen(_showInAppBanner);
  }

  @override
  void dispose() {
    _pushSubscription?.cancel();
    super.dispose();
  }

  void _showInAppBanner(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null || !mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 5),
        backgroundColor: AppColors.navy,
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (notification.title != null)
              Text(
                notification.title!,
                style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
              ),
            if (notification.body != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  notification.body!,
                  style: const TextStyle(color: AppColors.cream, fontSize: 13),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        centerTitle: false,
        title: Row(
          children: [
            const SayehLogo(size: 26),
            const SizedBox(width: 10),
            // The key has to be on .animate() itself, not the Text inside it — .animate()
            // wraps the Text in an Animate widget, and Animate only replays on
            // didUpdateWidget for a handful of specific property changes (controller,
            // duration, target/value), never because its child changed. A key one level
            // too deep silently no-ops: this key is what makes Flutter tear down and
            // recreate the Animate element (and so replay it) on every tab switch.
            Text(_titles[_index])
                .animate(key: ValueKey(_index))
                .fadeIn(duration: 220.ms)
                .slideY(begin: 0.3, curve: Curves.easeOut, duration: 220.ms),
            const Spacer(),
            // A real shortcut, not decoration: jumps straight to the tab it depicts
            // rather than sitting there as an inert icon — the same "بحث"/profile icon
            // cluster Libya Play's own header uses next to its logo.
            IconButton.filledTonal(
              tooltip: 'بحث',
              iconSize: 18,
              visualDensity: VisualDensity.compact,
              onPressed: () {
                _onTabSelected(0);
                _storeSearchController.open();
              },
              icon: const Icon(Icons.search_rounded),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'حسابي',
              iconSize: 18,
              visualDensity: VisualDensity.compact,
              onPressed: () => _onTabSelected(4),
              icon: const Icon(Icons.person_outline_rounded),
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          // Purely a dark-mode touch — on the light theme's cream surfaces the same
          // glow would just read as a smudge, not an accent.
          if (Theme.of(context).brightness == Brightness.dark) const AmbientGlow(),
          IndexedStack(index: _index, children: _pages),
        ],
      ),
      // Deliberately NOT extendBody: true — several tabs (see StoreScreen's floating
      // balance chip) position their own overlays with a `bottom:` offset tuned to a
      // body area that stops above the nav bar. Extending the body under the floating
      // pill would silently pull those overlays down behind it instead of making
      // content peek through, which is not worth it for a look this app doesn't use.
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Container(
          // The shadow has to live on this outer Container, not the ClipRRect below —
          // a shadow painted *inside* a clip just gets clipped away with everything else.
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), boxShadow: AppTheme.cardShadow),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: ColoredBox(
              color: Theme.of(context).brightness == Brightness.dark ? AppColors.darkSurfaceHigh : AppColors.surface,
              child: FloatingNavBar(
                selectedIndex: _index,
                onSelect: _onTabSelected,
                items: const [
                  NavItem(icon: Icons.storefront_outlined, selectedIcon: Icons.storefront, label: 'المتجر'),
                  NavItem(icon: Icons.trending_up_rounded, selectedIcon: Icons.trending_up_rounded, label: 'الرشق'),
                  NavItem(icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: 'طلباتي'),
                  NavItem(icon: Icons.account_balance_wallet_outlined, selectedIcon: Icons.account_balance_wallet, label: 'المحفظة'),
                  NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: 'حسابي'),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
