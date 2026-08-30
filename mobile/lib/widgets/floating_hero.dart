import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../screens/store/category_products_screen.dart';
import '../theme/app_theme.dart';
import '../utils/featured_brands.dart';

/// The Home Dashboard's top strip: three real brand categories (PlayStation, PUBG, Xbox —
/// see featured_brands.dart) as floating, tilted faceted-crystal shards on a dark blurred
/// panel. Went through several revisions per direct feedback before landing here: a center
/// Sayeh-mark circle with badges orbiting it (unreadable, clipped), plain white circles
/// (washed-out against real category art), squircles framed in section color ("just square
/// badges"), then plain glass pills ("زق") — this faceted-crystal-shard treatment (an
/// asymmetric triangle-to-hexagon shape with internal fracture lines, a chromatic/rainbow
/// dispersion rim, and specular edge highlights, per a fully-specified reference
/// implementation) was requested directly.
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
                height: 220,
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

/// One faceted crystal shard: floats on an independent sine phase, tilts in 3D toward the
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

class _GlassOrbitTokenState extends State<_GlassOrbitToken> with TickerProviderStateMixin {
  static const _dragResetSpring = SpringDescription(mass: 1, stiffness: 180, damping: 20);

  // A drag shorter than this is treated as a tap (navigates) rather than a
  // grab-and-release (just springs back) — matches how every other tappable
  // card in the app tolerates a little finger jitter without missing the tap.
  static const _tapSlop = 6.0;

  late final AnimationController _bounce;
  late final Animation<double> _bounceScale;
  late final AnimationController _dragReset;

  /// Current finger-driven offset from rest, in pixels — set directly while dragging,
  /// eased back to zero by [_dragReset] once the finger lifts.
  Offset _drag = Offset.zero;
  Offset _dragResetFrom = Offset.zero;

  @override
  void initState() {
    super.initState();
    _bounce = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
    _bounceScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.16).chain(CurveTween(curve: Curves.easeOut)), weight: 35),
      TweenSequenceItem(tween: Tween(begin: 1.16, end: 1.0).chain(CurveTween(curve: Curves.elasticOut)), weight: 65),
    ]).animate(_bounce);
    _dragReset = AnimationController(vsync: this)
      ..addListener(() {
        setState(() => _drag = Offset.lerp(_dragResetFrom, Offset.zero, _dragReset.value)!);
      });
  }

  @override
  void dispose() {
    _bounce.dispose();
    _dragReset.dispose();
    super.dispose();
  }

  Future<void> _handleTap() async {
    await _bounce.forward(from: 0);
    if (!mounted) return;
    widget.onTap();
  }

  void _onPanDown(DragDownDetails _) => _dragReset.stop();

  void _onPanUpdate(DragUpdateDetails details) => setState(() => _drag += details.delta);

  void _onPanEnd([Object? _]) {
    final wasTap = _drag.distance < _tapSlop;
    _dragResetFrom = _drag;
    _dragReset
      ..value = 0
      ..animateWith(SpringSimulation(_dragResetSpring, 0, 1, 0));
    if (wasTap) _handleTap();
  }

  static const double _shardWidth = 100;
  static const double _shardHeight = 145;

  @override
  Widget build(BuildContext context) {
    final brand = widget.item.brand;
    final scale = widget.isCenter ? 1.15 : 0.88;
    // A slow sine wave, phase-shifted per token so the three never bob in sync.
    final floatY = math.sin((widget.t * 2 * math.pi) + widget.phase) * (widget.isCenter ? 12 : 8);
    // Real 3D perspective (Matrix4 setEntry), not a plain rotation — the two side shards
    // lean toward the center one on both axes at once, the center one stays flat and
    // instead pulses its own glow so it still reads as "alive" without tilting. This is
    // each shard's own resting tilt — dragging adds on top of it and returning always
    // springs back to exactly this, not to flat.
    final restRotationY = widget.isCenter ? 0.0 : 0.18 * widget.tiltSign;
    final restRotationZ = widget.isCenter ? 0.0 : -0.06 * widget.tiltSign;
    final pulse = widget.isCenter ? (0.65 + 0.35 * (0.5 + 0.5 * math.sin(widget.t * 2 * math.pi))) : 1.0;

    // Dragging moves the shard with the finger on both axes and, per direct request,
    // lets it spin up to a full 180° — sideways drag maps onto the spin (a real coin-flip
    // reads as rotating around its vertical axis while it moves sideways), a fully
    // outstretched drag reaching exactly ±pi radians, while vertical drag adds a lighter
    // forward/back tilt so up/down movement still visibly does something in 3D.
    final dragSpin = (_drag.dx / 90.0).clamp(-1.0, 1.0) * math.pi;
    final dragTiltX = (_drag.dy / 140.0).clamp(-1.0, 1.0) * (math.pi / 6);

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onPanDown: _onPanDown,
      onPanUpdate: _onPanUpdate,
      onPanEnd: _onPanEnd,
      onPanCancel: _onPanEnd,
      child: AnimatedBuilder(
        animation: _bounce,
        builder: (context, child) => Transform.translate(
          offset: Offset(_drag.dx, floatY + _drag.dy),
          child: Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.002)
              ..rotateX(dragTiltX)
              ..rotateY(restRotationY + dragSpin)
              ..rotateZ(restRotationZ)
              ..scale(scale * _bounceScale.value),
            child: child,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: _shardWidth,
              height: _shardHeight,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Ambient neon halo — a decorated box with no visible fill, just a
                  // colored blur, so it reads as glow bleeding out from behind the glass
                  // rather than a fill flooding it.
                  Container(
                    width: _shardWidth * 0.7,
                    height: _shardHeight * 0.62,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: brand.color.withValues(alpha: (widget.isCenter ? 0.6 : 0.3) * pulse),
                          blurRadius: widget.isCenter ? 36 : 18,
                          spreadRadius: widget.isCenter ? 6 : 0,
                        ),
                      ],
                    ),
                  ),
                  CustomPaint(
                    size: const Size(_shardWidth, _shardHeight),
                    painter: _CrystalShardPainter(glowColor: brand.color, pulse: pulse),
                  ),
                  FractionallySizedBox(
                    widthFactor: 0.34,
                    heightFactor: 0.34,
                    child: SvgPicture.network(
                      'https://cdn.simpleicons.org/${brand.iconSlug}/ffffff',
                      fit: BoxFit.contain,
                      placeholderBuilder: (_) => const SizedBox.shrink(),
                      errorBuilder: (_, _, _) => const Icon(Icons.sports_esports_rounded, color: Colors.white70),
                    ),
                  ),
                ],
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

/// The faceted crystal shard shape itself: an asymmetric hybrid outline (a sharp triangular
/// peak fusing into a lopsided, faceted hexagonal body — deliberately not a circle or a
/// plain rectangle), a few translucent facet planes for depth, a network of jagged internal
/// "laser fracture" lines, and a rainbow (chromatic-dispersion) sweep stroked around the
/// whole outline — all per a fully-specified reference implementation. All coordinates are
/// fractions of the canvas size so the same painter serves every token regardless of the
/// scale its Transform applies on top.
class _CrystalShardPainter extends CustomPainter {
  const _CrystalShardPainter({required this.glowColor, required this.pulse});

  final Color glowColor;
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final outline = Path()
      ..moveTo(w * 0.50, h * 0.05)
      ..lineTo(w * 0.88, h * 0.28)
      ..lineTo(w * 0.82, h * 0.85)
      ..lineTo(w * 0.58, h * 0.98)
      ..lineTo(w * 0.22, h * 0.92)
      ..lineTo(w * 0.12, h * 0.35)
      ..close();

    // 1. Dark frosted-glass body.
    final bodyPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [const Color(0xFF1E293B).withValues(alpha: 0.55), const Color(0xFF0B0E14).withValues(alpha: 0.85)],
      ).createShader(Offset.zero & size);
    canvas.drawPath(outline, bodyPaint);

    // 2. Faceted reflection planes — alternating tints so the surface reads as multiple
    // angled panes of glass rather than one flat fill.
    final facetTopRight = Path()
      ..moveTo(w * 0.50, h * 0.05)
      ..lineTo(w * 0.88, h * 0.28)
      ..lineTo(w * 0.58, h * 0.48)
      ..close();
    final facetTopLeft = Path()
      ..moveTo(w * 0.50, h * 0.05)
      ..lineTo(w * 0.58, h * 0.48)
      ..lineTo(w * 0.12, h * 0.35)
      ..close();
    final facetBottom = Path()
      ..moveTo(w * 0.12, h * 0.35)
      ..lineTo(w * 0.58, h * 0.48)
      ..lineTo(w * 0.82, h * 0.85)
      ..lineTo(w * 0.58, h * 0.98)
      ..lineTo(w * 0.22, h * 0.92)
      ..close();
    canvas.drawPath(facetTopRight, Paint()..color = Colors.white.withValues(alpha: 0.14));
    canvas.drawPath(facetTopLeft, Paint()..color = Colors.white.withValues(alpha: 0.07));
    canvas.drawPath(facetBottom, Paint()..color = Colors.black.withValues(alpha: 0.12));

    // 3. Internal laser micro-fractures — a jagged spine from the peak to the base plus a
    // few branching hairline cracks, glowing blue/violet/rose to sell light refracting
    // inside the glass. Pulses gently with the same clock driving the token's float.
    final crackAlpha = 0.55 + 0.35 * pulse;
    final spine = Path()
      ..moveTo(w * 0.50, h * 0.05)
      ..lineTo(w * 0.58, h * 0.48)
      ..lineTo(w * 0.48, h * 0.72)
      ..lineTo(w * 0.58, h * 0.98);
    canvas.drawPath(
      spine,
      Paint()
        ..color = Colors.white.withValues(alpha: crackAlpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..strokeCap = StrokeCap.round,
    );
    final branches = [
      (Path()
        ..moveTo(w * 0.58, h * 0.48)
        ..lineTo(w * 0.82, h * 0.85), const Color(0xFF38BDF8)),
      (Path()
        ..moveTo(w * 0.48, h * 0.72)
        ..lineTo(w * 0.22, h * 0.92), const Color(0xFFC084FC)),
      (Path()
        ..moveTo(w * 0.58, h * 0.48)
        ..lineTo(w * 0.35, h * 0.55), const Color(0xFF38BDF8)),
    ];
    for (final (path, color) in branches) {
      canvas.drawPath(
        path,
        Paint()
          ..color = color.withValues(alpha: crackAlpha)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.1,
      );
    }

    // 4. Chromatic-dispersion rim — a rainbow sweep stroked around the whole outline, the
    // one element that most sells "cut crystal" over "glass blob".
    canvas.drawPath(
      outline,
      Paint()
        ..shader = SweepGradient(colors: [
          Colors.white.withValues(alpha: 0.95),
          const Color(0xFF38BDF8),
          const Color(0xFFC084FC),
          const Color(0xFFF43F5E),
          glowColor,
          Colors.white.withValues(alpha: 0.95),
        ]).createShader(Offset.zero & size)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeJoin = StrokeJoin.round,
    );

    // 5. Specular razor highlights — bright short strokes at the sharpest corners only,
    // where a real cut edge would catch the most light.
    final apexGlint = Path()
      ..moveTo(w * 0.40, h * 0.12)
      ..lineTo(w * 0.50, h * 0.05)
      ..lineTo(w * 0.65, h * 0.15);
    canvas.drawPath(
      apexGlint,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.9)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
    final baseGlint = Path()
      ..moveTo(w * 0.30, h * 0.90)
      ..lineTo(w * 0.22, h * 0.92)
      ..lineTo(w * 0.15, h * 0.55);
    canvas.drawPath(
      baseGlint,
      Paint()
        ..color = glowColor.withValues(alpha: 0.8)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant _CrystalShardPainter oldDelegate) =>
      oldDelegate.glowColor != glowColor || oldDelegate.pulse != pulse;
}
