import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../screens/store/category_products_screen.dart';
import '../theme/app_theme.dart';
import '../utils/featured_brands.dart';

/// The Home Dashboard's top strip: three real brand categories (PlayStation, PUBG, Xbox —
/// see featured_brands.dart) as floating, tilted glass tokens on a dark blurred panel.
/// Went through several revisions per direct feedback before landing here: a center
/// Sayeh-mark circle with badges orbiting it (unreadable, clipped), then plain white
/// circles (washed-out against real category art), then squircles framed in section
/// color (still read as "just square badges") — this "3D glass orbit token" treatment
/// (frosted glass pill, neon brand-color glow, slight 3D tilt on the two side tokens, a
/// bigger pulsing center token) was requested directly, reference code included.
class FloatingHero extends StatefulWidget {
  const FloatingHero({super.key, required this.items});

  final List<FeaturedCategory> items;

  @override
  State<FloatingHero> createState() => _FloatingHeroState();
}

class _FloatingHeroState extends State<FloatingHero> with SingleTickerProviderStateMixin {
  late final AnimationController _float;

  @override
  void initState() {
    super.initState();
    _float = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
  }

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // The middle slot is the visually featured one — PlayStation, per the requested
    // PUBG/PlayStation/Xbox order — bigger and with a pulsing glow instead of every token
    // reading as equally weighted.
    final centerIndex = widget.items.length ~/ 2;

    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 12),
          decoration: BoxDecoration(
            color: (isDark ? AppColors.navyDark : AppColors.navy).withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            children: [
              SizedBox(
                height: 168,
                child: AnimatedBuilder(
                  animation: _float,
                  builder: (context, _) => Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      for (int i = 0; i < widget.items.length; i++)
                        _GlassOrbitToken(
                          item: widget.items[i],
                          isCenter: i == centerIndex,
                          tiltSign: i < centerIndex ? 1 : (i > centerIndex ? -1 : 0),
                          t: _float.value,
                          phase: i * 0.9,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => CategoryProductsScreen(category: widget.items[i].category)),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'أفضل الفئات عندنا الآن',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: Colors.white.withValues(alpha: 0.75)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One frosted-glass pill: floats on an independent sine phase, tilts in 3D toward the
/// center token (side tokens only — the center one stays flat and instead pulses its own
/// glow), and punches outward with a springy bounce on tap before navigating.
class _GlassOrbitToken extends StatefulWidget {
  const _GlassOrbitToken({
    required this.item,
    required this.isCenter,
    required this.tiltSign,
    required this.t,
    required this.phase,
    required this.onTap,
  });

  final FeaturedCategory item;
  final bool isCenter;
  final int tiltSign;
  final double t;
  final double phase;
  final VoidCallback onTap;

  @override
  State<_GlassOrbitToken> createState() => _GlassOrbitTokenState();
}

class _GlassOrbitTokenState extends State<_GlassOrbitToken> with SingleTickerProviderStateMixin {
  late final AnimationController _bounce;
  late final Animation<double> _bounceScale;

  @override
  void initState() {
    super.initState();
    _bounce = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
    _bounceScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.16).chain(CurveTween(curve: Curves.easeOut)), weight: 35),
      TweenSequenceItem(tween: Tween(begin: 1.16, end: 1.0).chain(CurveTween(curve: Curves.elasticOut)), weight: 65),
    ]).animate(_bounce);
  }

  @override
  void dispose() {
    _bounce.dispose();
    super.dispose();
  }

  Future<void> _handleTap() async {
    await _bounce.forward(from: 0);
    if (!mounted) return;
    widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    final brand = widget.item.brand;
    final scale = widget.isCenter ? 1.15 : 0.92;
    // A slow sine wave, phase-shifted per token so the three never bob in sync.
    final floatY = math.sin((widget.t * 2 * math.pi) + widget.phase) * (widget.isCenter ? 10 : 7);
    // The 15° tilt is real perspective (Matrix4 setEntry), not a plain rotation — it's
    // what sells the two side tokens as leaning toward the center one in 3D.
    final tiltRadians = (math.pi / 12) * widget.tiltSign;
    // The center token doesn't tilt; instead its glow pulses with the same shared clock
    // driving everyone's float, so it reads as "alive" without needing a second controller.
    final pulse = widget.isCenter ? (0.65 + 0.35 * (0.5 + 0.5 * math.sin(widget.t * 2 * math.pi))) : 1.0;

    final width = widget.isCenter ? 86.0 : 74.0;
    final height = widget.isCenter ? 116.0 : 100.0;

    return GestureDetector(
      onTap: _handleTap,
      child: AnimatedBuilder(
        animation: _bounce,
        builder: (context, child) => Transform.translate(
          offset: Offset(0, floatY),
          child: Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0015)
              ..rotateY(tiltRadians)
              ..scale(scale * _bounceScale.value),
            child: child,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: width,
              height: height,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(40),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Colors.white.withValues(alpha: 0.18), Colors.white.withValues(alpha: 0.03)],
                ),
                border: Border.all(
                  color: brand.color.withValues(alpha: widget.isCenter ? 0.85 * pulse : 0.4),
                  width: widget.isCenter ? 2.0 : 1.2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: brand.color.withValues(alpha: (widget.isCenter ? 0.55 : 0.25) * pulse),
                    blurRadius: widget.isCenter ? 26 : 14,
                    spreadRadius: widget.isCenter ? 2 : 0,
                  ),
                ],
              ),
              child: Center(
                child: FractionallySizedBox(
                  widthFactor: 0.42,
                  heightFactor: 0.42,
                  child: SvgPicture.network(
                    'https://cdn.simpleicons.org/${brand.iconSlug}/ffffff',
                    fit: BoxFit.contain,
                    placeholderBuilder: (_) => const SizedBox.shrink(),
                    errorBuilder: (_, _, _) => const Icon(Icons.sports_esports_rounded, color: Colors.white70),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              brand.label,
              style: TextStyle(
                color: widget.isCenter ? Colors.white : Colors.white70,
                fontSize: widget.isCenter ? 13 : 11,
                fontWeight: widget.isCenter ? FontWeight.w800 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
