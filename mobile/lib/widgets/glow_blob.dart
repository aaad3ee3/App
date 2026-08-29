import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A soft, blurred-looking circle of color that fades to nothing — the "corner glow"
/// decoration used on hero cards (wallet balance, profile header, ...). Not an actual
/// blur (no ImageFilter/BackdropFilter cost): a RadialGradient already fades smoothly
/// enough at this size that a real blur filter would be indistinguishable, for free.
///
/// Meant to be a `Positioned` child, partially off the edge of its container (see call
/// sites), inside a `ClipRRect` matching the container's own radius.
class GlowBlob extends StatelessWidget {
  const GlowBlob({super.key, this.size = 120, this.alpha = 0.14, this.color = AppColors.gold});

  final double size;
  final double alpha;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color.withValues(alpha: alpha), color.withValues(alpha: 0)]),
      ),
    );
  }
}
