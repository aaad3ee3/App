import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../screens/store/category_products_screen.dart';
import '../utils/featured_brands.dart';

/// The Home Dashboard's top strip: three real brand categories (PlayStation, PUBG, Xbox —
/// see featured_brands.dart) as floating, tilted faceted-crystal gems. Went through several
/// revisions per direct feedback before landing here: a center Sayeh-mark circle with badges
/// orbiting it (unreadable, clipped), plain white circles (washed-out against real category
/// art), squircles framed in section color ("just square badges"), plain glass pills ("زق"),
/// then a first crystal-shard pass that read as flat 2D scribbles on a boxed dark panel —
/// per direct feedback the panel itself was dropped (transparent, blends into the page
/// instead of sitting in a gray box) and the shard shape/shading redone as a symmetric
/// hexagonal gem with a from-within radial glow and shaded pie-slice facets, matching a
/// real reference screenshot's actual 3D gem-badge look rather than 2D fracture lines.
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
    // Sped up per direct feedback that the float felt sluggish — was a 3s cycle.
    _float = AnimationController(vsync: this, duration: const Duration(milliseconds: 1700))..repeat();
  }

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return const SizedBox.shrink();
    // The middle slot is the visually featured one — PlayStation, per the requested
    // PUBG/PlayStation/Xbox order — bigger and with a pulsing glow instead of every token
    // reading as equally weighted.
    final centerIndex = widget.items.length ~/ 2;

    // No boxed panel around the gems per direct feedback — they float straight on the
    // page background instead of sitting in a gray card, while still reading as 3D
    // themselves via the shard shading/glow (see _CrystalShardPainter).
    return Column(
      children: [
        SizedBox(
          height: 150,
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
        const SizedBox(height: 8),
        Text(
          'أفضل الفئات عندنا الآن',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 12.5,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.65),
          ),
        ),
      ],
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
  // Stiffer than the login card's own reset spring — a small shard reads as sluggish at
  // the same settle speed a much bigger card gets away with, per direct feedback.
  static const _dragResetSpring = SpringDescription(mass: 1, stiffness: 320, damping: 24);

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
    _bounce = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
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

  static const double _shardWidth = 82;
  static const double _shardHeight = 112;

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

/// The faceted crystal gem shape itself — rebuilt per direct feedback that the first pass
/// read as flat 2D scribbles ("زق"), not the volumetric cut-gem look of the reference
/// screenshot: a symmetric elongated hexagon (matching the reference's actual outline,
/// not the earlier lopsided one), a radial "glow from within" fill standing in for a light
/// source behind the glass, six pie-slice facets shaded light-to-dark like a real gem
/// catching one light source, and a rainbow chromatic-dispersion rim. All coordinates are
/// fractions of the canvas size so the same painter serves every token regardless of the
/// scale its Transform applies on top.
class _CrystalShardPainter extends CustomPainter {
  const _CrystalShardPainter({required this.glowColor, required this.pulse});

  final Color glowColor;
  final double pulse;

  // Relative brightness per facet (positive = white highlight, negative = shadow) —
  // stronger contrast than a flat tint, which is what actually reads as "3D cut" rather
  // than a flat painted hexagon.
  static const _facetShades = [0.30, 0.06, -0.16, -0.30, -0.12, 0.14];

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final center = Offset(w * 0.5, h * 0.5);
    final radius = w * 0.62;

    final vertices = [
      Offset(w * 0.50, h * 0.03), // top
      Offset(w * 0.94, h * 0.30), // upper right
      Offset(w * 0.94, h * 0.74), // lower right
      Offset(w * 0.50, h * 0.99), // bottom
      Offset(w * 0.06, h * 0.74), // lower left
      Offset(w * 0.06, h * 0.30), // upper left
    ];
    final outline = Path()..addPolygon(vertices, true);

    // 1. Radial glow-from-within fill — a bright core fading to near-black at the rim, so
    // the gem reads as lit from behind the glass rather than as a flat painted shape.
    canvas.drawPath(
      outline,
      Paint()
        ..shader = RadialGradient(
          colors: [
            Color.lerp(glowColor, Colors.white, 0.35)!.withValues(alpha: 0.55 * pulse),
            const Color(0xFF141A26).withValues(alpha: 0.92),
            const Color(0xFF05070C).withValues(alpha: 0.97),
          ],
          stops: const [0.0, 0.55, 1.0],
        ).createShader(Rect.fromCircle(center: center, radius: radius)),
    );

    // 2. Six pie-slice facets fanning out from center to each edge, alternating
    // light/shadow tints — a real cut gem catching a single light source differently per
    // face. This is what replaces the old jagged "fracture" lines, which read as
    // scratches rather than as an actual faceted 3D surface.
    for (var i = 0; i < vertices.length; i++) {
      final a = vertices[i];
      final b = vertices[(i + 1) % vertices.length];
      final facet = Path()
        ..moveTo(center.dx, center.dy)
        ..lineTo(a.dx, a.dy)
        ..lineTo(b.dx, b.dy)
        ..close();
      final shade = _facetShades[i];
      canvas.drawPath(facet, Paint()..color = (shade >= 0 ? Colors.white : Colors.black).withValues(alpha: shade.abs()));
    }

    // 3. Fine straight facet-divider lines from center to each vertex — clean cut edges,
    // not scribbled cracks.
    final dividerPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.16)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final v in vertices) {
      canvas.drawLine(center, v, dividerPaint);
    }

    // 4. Chromatic-dispersion rim — a rainbow sweep stroked around the whole outline, the
    // one element that most sells "cut gem" over "glass blob".
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
        ]).createShader(Rect.fromCircle(center: center, radius: radius))
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.8
        ..strokeJoin = StrokeJoin.round,
    );

    // 5. Specular highlight streaks at two opposing edges — a rounded cut edge catching
    // light, matching the reference's own top/side glints.
    canvas.drawLine(
      Offset(w * 0.28, h * 0.11),
      Offset(w * 0.50, h * 0.03),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.9)
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawLine(
      Offset(w * 0.94, h * 0.40),
      Offset(w * 0.94, h * 0.58),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.55)
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant _CrystalShardPainter oldDelegate) =>
      oldDelegate.glowColor != glowColor || oldDelegate.pulse != pulse;
}
