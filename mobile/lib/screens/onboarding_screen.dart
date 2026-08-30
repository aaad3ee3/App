import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:provider/provider.dart';
import '../services/settings_store.dart';
import '../theme/app_theme.dart';
import '../widgets/orbit_badge.dart';
import '../widgets/sayeh_logo.dart';
import 'auth/login_screen.dart';

/// A brand's Simple Icons logo (real, confirmed slugs — the same ones
/// backend/src/modules/catalog/brand-icons.ts and plus-categorization.ts already use for
/// these platforms) or, where no real brand applies (Libyana has no consumer logo we can
/// use), a plain Material icon. Either way this is illustrative — "the kind of thing you
/// can buy here" — never a claim about specific live inventory.
class _FloatIcon {
  const _FloatIcon.brand(String slug, String color)
      : icon = null,
        _url = 'https://cdn.simpleicons.org/$slug/$color';
  const _FloatIcon.icon(this.icon) : _url = null;

  final IconData? icon;
  final String? _url;
}

class _Slide {
  const _Slide({required this.icon, required this.title, required this.body, this.floatIcons = const []});
  final IconData icon;
  final String title;
  final String body;
  final List<_FloatIcon> floatIcons;
}

/// A small vertical stagger per badge so the row of three reads as loosely floating
/// rather than a mechanical, perfectly-aligned grid.
const _kBadgeTopOffsets = [0.0, 16.0, 6.0];

/// Shown once, on the very first launch, before the customer is asked to sign up.
///
/// The order is deliberate: the primary business (gift cards, game top-ups, funding the
/// wallet) leads, and الرشق — the social-growth services, a secondary line — comes last
/// rather than competing for the second slide's attention. "You need an account" was
/// always last and stays last.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  static const _slides = [
    _Slide(
      icon: Icons.card_giftcard_rounded,
      title: 'بطاقات رقمية',
      body: 'بطاقات ألعاب ومتاجر عالمية — بلايستيشن، ستيم، آيتونز وغيرها، بأسعار بالدينار الليبي.',
      floatIcons: [
        _FloatIcon.brand('playstation', '0070D1'),
        _FloatIcon.brand('netflix', 'E50914'),
        _FloatIcon.brand('steam', '1B2838'),
      ],
    ),
    _Slide(
      icon: Icons.sports_esports_rounded,
      title: 'شحن ألعاب',
      body: 'شدات ببجي، جواهر فري فاير، وشحن أشهر الألعاب — يوصلك الكود خلال دقائق.',
      floatIcons: [
        _FloatIcon.brand('pubg', 'F2A900'),
        _FloatIcon.brand('fortnite', '000000'),
        _FloatIcon.brand('roblox', '000000'),
      ],
    ),
    _Slide(
      icon: Icons.account_balance_wallet_rounded,
      title: 'اشحن بليبيانا',
      body: 'حوّل رصيد ليبيانا لرقم المتجر، وينضاف لمحفظتك تلقائياً. بعدها تشتري بضغطة.',
      // No real Libyana consumer logo exists to show here, so this stays icon-only rather
      // than guessing at a brand mark.
      floatIcons: [
        _FloatIcon.icon(Icons.sim_card_rounded),
        _FloatIcon.icon(Icons.bolt_rounded),
        _FloatIcon.icon(Icons.qr_code_rounded),
      ],
    ),
    _Slide(
      icon: Icons.trending_up_rounded,
      title: 'الرشق',
      body: 'متابعين وإعجابات ومشاهدات لكل المنصات، تطلبها من التطبيق مباشرة.',
      floatIcons: [
        _FloatIcon.brand('instagram', 'E4405F'),
        _FloatIcon.brand('tiktok', '000000'),
        _FloatIcon.brand('youtube', 'FF0000'),
      ],
    ),
  ];

  bool get _isLast => _index == _slides.length - 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await context.read<SettingsStore>().markOnboardingSeen();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  void _next() {
    if (_isLast) {
      _finish();
      return;
    }
    _controller.nextPage(duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: isDark
                ? [AppColors.darkBackground, AppColors.navyDark]
                : [AppColors.creamLight, AppColors.cream],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const SayehLogo(size: 34),
                    // Always available, including on the last slide — someone who has
                    // seen enough should never have to page through the rest to escape.
                    TextButton(
                      onPressed: _finish,
                      child: const Text('تخطي'),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: _slides.length,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemBuilder: (context, i) => _SlideView(slide: _slides[i]),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _slides.length,
                  (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    height: 7,
                    width: i == _index ? 22 : 7,
                    decoration: BoxDecoration(
                      color: i == _index
                          ? AppColors.gold
                          : Theme.of(context).colorScheme.onSurfaceVariant.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _next,
                    child: Text(_isLast ? 'ابدأ الآن' : 'التالي'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});

  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Three large brand/illustrative badges, floating and tilting on an endless
          // loop — the same Phantom-style motion as the store's own home hero. No center
          // icon anymore: a small icon-in-a-circle plus three tiny orbiting badges just
          // read as a cluttered, half-clipped mess at this size — three plain, big badges
          // are what's actually legible on a phone screen.
          SizedBox(
            height: 160,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (int i = 0; i < slide.floatIcons.length; i++)
                  Padding(
                    padding: EdgeInsets.only(top: _kBadgeTopOffsets[i % _kBadgeTopOffsets.length]),
                    child: OrbitBadge(seed: i, size: 80, child: _FloatIconArt(spec: slide.floatIcons[i])),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Text(
            slide.title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 14),
          Text(
            slide.body,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              height: 1.7,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _FloatIconArt extends StatelessWidget {
  const _FloatIconArt({required this.spec});

  final _FloatIcon spec;

  @override
  Widget build(BuildContext context) {
    if (spec.icon != null) {
      return Icon(spec.icon, color: AppColors.navy.withValues(alpha: 0.65), size: 38);
    }
    return SvgPicture.network(
      spec._url!,
      fit: BoxFit.contain,
      placeholderBuilder: (_) => const SizedBox.shrink(),
      errorBuilder: (_, _, _) => Icon(Icons.bolt_rounded, color: AppColors.navy.withValues(alpha: 0.4), size: 34),
    );
  }
}
