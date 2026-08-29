import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'tap_scale.dart';

/// A small circular badge that floats and tilts on an endless loop — the shared building
/// block behind every "layered floating card" composition in the app (the Home
/// Dashboard's hero, the onboarding slides). Each instance runs its own independent loop,
/// timed off [seed] (a different duration/delay/tilt direction per badge) so several of
/// them together never drift in sync and read as mechanical.
class OrbitBadge extends StatelessWidget {
  const OrbitBadge({super.key, required this.child, required this.seed, this.onTap, this.size = 54});

  final Widget child;
  final int seed;
  final VoidCallback? onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    final duration = Duration(milliseconds: 3200 + seed * 500);
    final delay = Duration(milliseconds: seed * 250);
    final rotateBegin = seed.isEven ? -0.035 : 0.02;
    final rotateEnd = seed.isEven ? -0.01 : 0.055;

    final badge = Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.15),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: child,
    );

    final tappable = onTap == null
        ? badge
        : TapScale(
            child: Material(
              color: Colors.transparent,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(onTap: onTap, child: badge),
            ),
          );

    return tappable
        .animate(onPlay: (controller) => controller.repeat(reverse: true), delay: delay)
        .moveY(begin: 0, end: -10, duration: duration, curve: Curves.easeInOut)
        .rotate(begin: rotateBegin, end: rotateEnd, duration: duration, curve: Curves.easeInOut);
  }
}
