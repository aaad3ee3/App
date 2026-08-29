import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import '../theme/app_theme.dart';

/// A physically-interactive 3D bank-card hero, modeled on Revolut's own pre-auth landing
/// card: a spring-driven entrance (real spring physics via package:flutter/physics.dart —
/// mass/stiffness/damping, not a fixed-duration curve, is what makes the settle read as
/// physical rather than "animated"), a continuous idle sine-wave float, and finger-drag
/// parallax tilt with a counter-moving specular sheen. Built with Sayeh's own navy/gold
/// palette rather than Revolut's blue/violet.
///
/// Deliberately touch-driven only, not gyro-driven: a device-tilt version needs a sensor
/// plugin (e.g. sensors_plus) this app does not currently depend on, and this sandbox has
/// no Flutter SDK to verify a brand-new native dependency actually builds — adding one
/// blind would be the one part of the original spec not backed by something checkable here.
class InteractiveBankCard extends StatefulWidget {
  const InteractiveBankCard({super.key, this.width = 280, this.height = 176});

  final double width;
  final double height;

  @override
  State<InteractiveBankCard> createState() => _InteractiveBankCardState();
}

class _InteractiveBankCardState extends State<InteractiveBankCard> with TickerProviderStateMixin {
  static const _entranceSpring = SpringDescription(mass: 1, stiffness: 120, damping: 14);
  static const _resetSpring = SpringDescription(mass: 1, stiffness: 180, damping: 20);

  // Headroom around the card itself for the fan cards' spread and the idle float's travel.
  static const _padding = 34.0;

  late final AnimationController _entrance;
  late final AnimationController _idle;
  late final AnimationController _dragReset;

  /// Current interactive tilt, normalized to roughly -1..1 per axis (finger position
  /// relative to the card's center). Driven directly during a drag; eased back to zero by
  /// [_dragReset] once the finger lifts.
  Offset _drag = Offset.zero;
  Offset _dragResetFrom = Offset.zero;

  @override
  void initState() {
    super.initState();
    _entrance = AnimationController(vsync: this);
    _idle = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
    _dragReset = AnimationController(vsync: this)
      ..addListener(() {
        setState(() => _drag = Offset.lerp(_dragResetFrom, Offset.zero, _dragReset.value)!);
      });

    // A post-frame kick rather than firing in initState — lets the very first paint show
    // the "thrown from depth" starting pose instead of the spring already being mid-flight.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _entrance.animateWith(SpringSimulation(_entranceSpring, 0, 1, 0));
    });
  }

  @override
  void dispose() {
    _entrance.dispose();
    _idle.dispose();
    _dragReset.dispose();
    super.dispose();
  }

  void _onPanStart(DragStartDetails _) => _dragReset.stop();

  void _onPanUpdate(DragUpdateDetails details) {
    final dx = ((details.localPosition.dx / widget.width) * 2 - 1).clamp(-1.0, 1.0);
    final dy = ((details.localPosition.dy / widget.height) * 2 - 1).clamp(-1.0, 1.0);
    setState(() => _drag = Offset(dx, dy));
  }

  void _onPanEnd([Object? _]) {
    _dragResetFrom = _drag;
    _dragReset
      ..value = 0
      ..animateWith(SpringSimulation(_resetSpring, 0, 1, 0));
  }

  @override
  Widget build(BuildContext context) {
    final boxWidth = widget.width + _padding * 2;
    final boxHeight = widget.height + _padding * 2;

    return SizedBox(
      width: boxWidth,
      height: boxHeight,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // The fanned backdrop stays fixed — only the top card responds to touch, the
          // same split the reference keeps between a static fan and one live card.
          ..._fanCards(),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onPanStart: _onPanStart,
            onPanUpdate: _onPanUpdate,
            onPanEnd: _onPanEnd,
            onPanCancel: _onPanEnd,
            child: AnimatedBuilder(
              animation: Listenable.merge([_entrance, _idle]),
              builder: (context, _) {
                final t = _entrance.value;
                final settle = t.clamp(0.0, 1.0);

                final baseRotateX = _lerp(35, 12, t);
                final baseRotateY = _lerp(-25, -10, t);
                final baseRotateZ = _lerp(-15, -8, t);
                final scale = _lerp(0.8, 1.0, t);

                // True sine wave, per spec — a full cycle every 4s via _idle's duration.
                final wave = math.sin(_idle.value * 2 * math.pi);
                final idleY = wave * 6.0 * settle;
                final idleRotZ = wave * 1.5 * settle;
                final idleRotX = wave * 2.0 * settle;

                // Drag adds up to +-20deg, opposite-signed on Y/X so dragging toward you
                // tilts the card away from the finger, the way a stiff real card would.
                final dragRotateY = _drag.dx * 20;
                final dragRotateX = -_drag.dy * 20;

                final matrix = Matrix4.identity()
                  ..setEntry(3, 2, 0.001)
                  ..translate(0.0, idleY)
                  ..rotateX(_deg2rad(baseRotateX + idleRotX + dragRotateX))
                  ..rotateY(_deg2rad(baseRotateY + dragRotateY))
                  ..rotateZ(_deg2rad(baseRotateZ + idleRotZ))
                  ..scale(scale, scale, scale);

                // The sheen slides opposite the tilt — the cue that sells the surface as a
                // real reflective card rather than a flat printed image.
                final sheen = Offset(-_drag.dx - wave * 0.1, -_drag.dy);

                return Opacity(
                  opacity: settle,
                  child: Transform(
                    alignment: Alignment.center,
                    transform: matrix,
                    child: _cardFace(sheen),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _fanCards() {
    const count = 5;
    return [
      for (int i = count; i >= 1; i--)
        Transform.rotate(
          angle: _deg2rad(-6.0 * i),
          child: Transform.translate(
            offset: Offset(2.0 * i, -3.0 * i),
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 0.6, sigmaY: 0.6),
              child: Container(
                width: widget.width,
                height: widget.height,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12 + (count - i) * 0.07),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
              ),
            ),
          ),
        ),
    ];
  }

  Widget _cardFace(Offset sheen) {
    return RepaintBoundary(
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.navyDark, AppColors.navy, AppColors.goldDark],
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 24, offset: const Offset(0, 14))],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            // Specular sheen: a diagonal light band, offset by [sheen] each frame.
            Positioned.fill(
              child: FractionalTranslation(
                translation: sheen,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      stops: const [0.32, 0.5, 0.68],
                      colors: [
                        Colors.white.withValues(alpha: 0),
                        Colors.white.withValues(alpha: 0.22),
                        Colors.white.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Metallic chip.
                  Container(
                    width: 40,
                    height: 30,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFFE9D8A6), Color(0xFFBFA24B)]),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.black.withValues(alpha: 0.15)),
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'sayeh',
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1,
                      fontFamily: 'Roboto',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _deg2rad(double deg) => deg * math.pi / 180;
  double _lerp(double a, double b, double t) => a + (b - a) * t;
}
