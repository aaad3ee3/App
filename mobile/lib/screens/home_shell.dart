import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
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
  // deep inside the profile.
  static const _titles = ['المتجر', 'طلباتي', 'المحفظة', 'حسابي'];

  // The store is the one tab a visitor gets in full — everything else is about *their*
  // money and *their* orders, which needs an account to even mean anything.
  static const _pages = [
    StoreScreen(),
    RequiresAccount(
      gate: SignInGate(
        icon: Icons.receipt_long_rounded,
        title: 'طلباتك تبان هنا',
        message: 'أنشئ حساب عشان تشتري وتتابع طلباتك وتلقى أكوادك محفوظة في أي وقت.',
      ),
      child: OrdersHistoryScreen(embedded: true),
    ),
    RequiresAccount(
      gate: SignInGate(
        icon: Icons.account_balance_wallet_rounded,
        title: 'محفظتك',
        message: 'أنشئ حساب عشان تشحن رصيدك بليبيانا وتشتري بضغطة وحدة.',
      ),
      child: WalletScreen(),
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
        title: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            const SayehLogo(size: 26),
            const SizedBox(width: 10),
            Text(_titles[_index]),
          ],
        ),
      ),
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'المتجر'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'طلباتي'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'المحفظة'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'حسابي'),
        ],
      ),
    );
  }
}
