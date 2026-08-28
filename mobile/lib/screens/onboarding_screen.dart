import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/settings_store.dart';
import '../theme/app_theme.dart';
import '../widgets/sayeh_logo.dart';
import 'auth/login_screen.dart';

class _Slide {
  const _Slide({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;
}

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
    ),
    _Slide(
      icon: Icons.sports_esports_rounded,
      title: 'شحن ألعاب',
      body: 'شدات ببجي، جواهر فري فاير، وشحن أشهر الألعاب — يوصلك الكود خلال دقائق.',
    ),
    _Slide(
      icon: Icons.account_balance_wallet_rounded,
      title: 'اشحن بليبيانا',
      body: 'حوّل رصيد ليبيانا لرقم المتجر، وينضاف لمحفظتك تلقائياً. بعدها تشتري بضغطة.',
    ),
    _Slide(
      icon: Icons.trending_up_rounded,
      title: 'الرشق',
      body: 'متابعين وإعجابات ومشاهدات لكل المنصات، تطلبها من التطبيق مباشرة.',
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
          Container(
            width: 116,
            height: 116,
            decoration: BoxDecoration(
              color: AppColors.gold.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(slide.icon, size: 56, color: AppColors.gold),
          ),
          const SizedBox(height: 36),
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
