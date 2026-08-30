import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import '../theme/app_theme.dart';
import 'sayeh_logo.dart';

/// A physically-interactive 3D hero card for the login screen — the Sayeh mark itself,
/// not a fabricated bank card (direct feedback: a Visa-style mockup doesn't correspond to
/// anything Sayeh actually sells). Orbiting section badges were tried and removed per
/// direct feedback too — the plain card floating on its own read better on its own.
///
/// The physics are unchanged from the reference this was built against (Revolut's own
/// pre-auth card): a spring-driven entrance (real mass/stiffness/damping via
/// package:flutter/physics.dart, not a fixed-duration curve), a continuous idle sine-wave
/// float, and finger-drag parallax tilt with a counter-moving specular sheen — only what
/// sits on the card face changed.
///
/// Touch-driven only, not gyro-driven: a device-tilt version needs a sensor plugin (e.g.
/// sensors_plus) this app does not depend on, and this sandbox has no Flutter SDK to
/// verify a brand-new native dependency actually builds.
class InteractiveBrandCard extends StatefulWidget {
  const InteractiveBrandCard({super.key, this.width = 260, this.height = 164});

  final double width;
  final double height;

  @override
  State<InteractiveBrandCard> createState() => _InteractiveBrandCardState();
}

class _InteractiveBrandCardState extends State<InteractiveBrandCard> with TickerProviderStateMixin {
  static const _entranceSpring = SpringDescription(mass: 1, stiffness: 120, damping: 14);
  static const _resetSpring = SpringDescription(mass: 1, stiffness: 180, damping: 20);

  // Headroom around the card for the fan cards' spread and the idle float's travel.
  static const _padding = 26.0;

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
          // The fanned backdrop stays fixed — only the main card responds to touch.
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

                // The sheen slides opposite the tilt — the cue that sells the surface as
                // reflective rather than a flat printed image.
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
          borderRadius: BorderRadius.circular(22),
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
                        Colors.white.withValues(alpha: 0.2),
                        Colors.white.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            // SayehLogo's wordmark reads the ambient theme's brightness to pick a
            // readable color (cream on dark, navy on light) — but this card's background
            // is always the same navy gradient regardless of the app's own theme, so the
            // wordmark needs to always use the dark-theme (cream) variant here, not
            // whatever the app happens to be set to.
            Center(
              child: Theme(
                data: Theme.of(context).copyWith(brightness: Brightness.dark),
                child: const SayehLogo(size: 52, showWordmark: true),
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
