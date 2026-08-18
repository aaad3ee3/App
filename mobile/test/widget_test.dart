import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sayeh/main.dart';
import 'package:sayeh/screens/auth/login_screen.dart';
import 'package:sayeh/services/push_service.dart';
import 'package:sayeh/theme/app_theme.dart';
import 'package:sayeh/utils/arabic_text.dart';
import 'package:sayeh/utils/money.dart';
import 'package:sayeh/widgets/phone_field.dart';
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

  testWidgets('logo keeps its size inside a stretching column', (tester) async {
    // Regression test: every form screen lays out with CrossAxisAlignment.stretch, which
    // hands children a tight full-width constraint. The mark used to scale to it and
    // balloon across the screen, painting over the heading beneath it.
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [SayehLogo(size: 60)],
          ),
        ),
      ),
    );

    // Scoped to the logo's own subtree — Material widgets put their own CustomPaints in
    // the tree, and a bare byType would measure one of those instead.
    final mark = find.descendant(
      of: find.byType(SayehLogo),
      matching: find.byType(CustomPaint),
    );

    expect(tester.getSize(mark.first), const Size(60, 60));
  });

  group('Libyana-only phone validation', () {
    // The carrier split is easy to get backwards and invisible in the code — nothing
    // about 092 looks more Libyana than 091 — so it is pinned down explicitly here,
    // matching the server-side rule in backend/src/lib/phone.ts.
    test('accepts Libyana numbers (092 / 094) in any format', () {
      for (final input in ['0921234567', '0941234567', '+218921234567', '00218941234567', '092 123 4567']) {
        expect(PhoneField.validate(input), isNull, reason: '$input should be accepted');
      }
    });

    test('rejects Al-Madar numbers (091 / 093)', () {
      for (final madar in ['0911234567', '0931234567', '+218911234567']) {
        expect(PhoneField.validate(madar), isNotNull, reason: '$madar must be rejected');
      }
    });

    test('rejects malformed input', () {
      for (final bad in ['', '123', '09212345', '0812345678']) {
        expect(PhoneField.validate(bad), isNotNull, reason: '"$bad" must be rejected');
      }
    });
  });

  group('Arabic search matching', () {
    // Must agree with normalizeSearchText in backend/src/lib/search.ts: a product the
    // customer found through server search has to stay findable when they type the same
    // words into the on-device filter.
    test('folds the spellings customers use interchangeably', () {
      expect(matchesSearch('ألعاب فيديو', 'العاب'), isTrue);
      expect(matchesSearch('بطاقة جوجل بلاي', 'بطاقه'), isTrue);
      expect(matchesSearch('PUBG Mobile', 'pubg'), isTrue);
    });

    test('needs every word to match, so typing more narrows the list', () {
      expect(matchesSearch('325 UC ببجي', '325 uc'), isTrue);
      expect(matchesSearch('60 UC ببجي', '325 uc'), isFalse);
    });

    test('an empty query matches everything', () {
      expect(matchesSearch('أي منتج', '   '), isTrue);
    });
  });

  group('money formatting', () {
    test('drops the padding Postgres adds to NUMERIC(14,4)', () {
      // "9.2900" on a price tag reads as a rounding bug, not a price.
      expect(formatLydString('9.2900'), '9.29');
      expect(formatLydString('232.0000'), '232.00');
    });

    test('keeps the dirham when an SMM total actually lands there', () {
      // A per-1000 rate times a quantity genuinely produces thousandths.
      expect(formatLyd(0.171), '0.171');
      expect(formatLyd(1.7), '1.70');
    });

    test('never swallows an amount it cannot parse', () {
      expect(formatLydString('not-a-number'), 'not-a-number');
    });
  });

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
