import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_theme.dart';

/// A soft, slowly breathing light behind the top of the screen — the "premium/alive"
/// touch the user pointed at in a competitor screenshot (a moving glow behind an
/// otherwise plain dark screen). Purely decorative: no gesture handling, sits behind
/// everything else in the Stack it's placed in, and only shows through the gaps between
/// opaque content (cards, the app bar) since it never paints anything solid itself.
///
/// Only worth using against a dark background — the same soft glow would just look like
/// a dirty smudge on the light theme's cream surfaces, so callers should gate this on
/// `Theme.of(context).brightness == Brightness.dark`.
class AmbientGlow extends StatelessWidget {
  const AmbientGlow({super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Align(
        alignment: const Alignment(0, -1.1),
        child: Container(
          width: 480,
          height: 480,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                AppColors.gold.withValues(alpha: 0.16),
                AppColors.gold.withValues(alpha: 0.0),
              ],
            ),
          ),
        )
            .animate(onPlay: (c) => c.repeat(reverse: true))
            .scaleXY(begin: 0.85, end: 1.05, duration: 4200.ms, curve: Curves.easeInOut)
            // A partial fade (0.6→1), not a full 0→1 — the glow should breathe, not
            // disappear and reappear every few seconds.
            .fadeIn(begin: 0.6, duration: 4200.ms, curve: Curves.easeInOut),
      ),
    );
  }
}
