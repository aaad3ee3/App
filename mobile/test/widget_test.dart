import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sayeh/main.dart';
import 'package:sayeh/screens/auth/login_screen.dart';
import 'package:sayeh/services/push_service.dart';
import 'package:sayeh/theme/app_theme.dart';
import 'package:sayeh/widgets/sayeh_logo.dart';

/// flutter_secure_storage talks to a platform channel that does not exist in a widget
/// test. Stubbing it lets the real startup path (splash -> AuthStore.bootstrap -> route)
/// run end to end; without it the test exercises an error branch instead of the flow
/// users actually take.
void _stubSecureStorage({String? storedToken}) {
  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
    channel,
    (call) async => switch (call.method) {
      'read' => storedToken,
      'readAll' => <String, String>{},
      _ => null,
    },
  );
}

void main() {
  setUp(() => _stubSecureStorage());

  testWidgets('boots to a branded splash screen', (tester) async {
    await tester.pumpWidget(const SayehApp());
    await tester.pump();

    expect(find.byType(SayehLogo), findsOneWidget);
    expect(find.text('sayeh'), findsOneWidget);

    // Drain the splash hold and the route transition. pumpAndSettle would time out here:
    // the progress indicator animates forever, so it never reaches a settled frame.
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 400));
  });

  testWidgets('routes a signed-out user to the login screen', (tester) async {
    await tester.pumpWidget(const SayehApp());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('lays out right-to-left for Arabic', (tester) async {
    await tester.pumpWidget(const SayehApp());
    await tester.pump();

    expect(Directionality.of(tester.element(find.byType(SayehLogo))), TextDirection.rtl);

    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 400));
  });

  testWidgets('startup gives up on Firebase rather than hanging', (tester) async {
    // Regression test for a real hang: with no platform implementation,
    // Firebase.initializeApp() never completes — it does not throw. Because main()
    // awaits it before runApp, an unbounded wait shows a blank screen forever, so an
    // optional feature would look like a completely broken app.
    //
    // fakeAsync lets the 5s timeout elapse instantly instead of stalling the suite.
    await tester.runAsync(() async {
      final done = PushService.initializeFirebase();
      final completed = await done
          .then((_) => true)
          .timeout(const Duration(seconds: 8), onTimeout: () => false);

      expect(completed, isTrue, reason: 'initializeFirebase must always settle');
    });

    expect(PushService.isAvailable, isFalse);
  }, timeout: const Timeout(Duration(seconds: 30)));

  group('theme', () {
    test('light and dark both carry the brand palette', () {
      expect(AppTheme.light.colorScheme.primary, AppColors.navy);
      expect(AppTheme.light.colorScheme.secondary, AppColors.gold);
      expect(AppTheme.light.scaffoldBackgroundColor, AppColors.background);

      // Dark mode inverts which brand colour leads: navy is the background there, so gold
      // has to carry the primary role to stay legible.
      expect(AppTheme.dark.colorScheme.primary, AppColors.goldLight);
      expect(AppTheme.dark.scaffoldBackgroundColor, AppColors.darkBackground);
    });

    test('keeps a Latin fallback so prices do not render as tofu', () {
      // Cairo ships no Latin glyphs; without the fallback, every LYD amount and Latin
      // product name would render as empty boxes.
      expect(AppTheme.fontFallback, contains('Roboto'));
    });
  });
}
