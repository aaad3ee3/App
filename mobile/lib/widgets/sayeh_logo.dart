import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The Sayeh mark: a navy `S` whose lower half becomes a gold ribbon.
///
/// Drawn rather than shipped as a raster so it stays crisp at every size — it appears
/// from 28px in the app bar up to 96px on the splash screen — and so its two colours
/// follow the theme instead of being baked into a PNG.
class SayehLogo extends StatelessWidget {
  const SayehLogo({super.key, this.size = 64, this.showWordmark = false});

  final double size;
  final bool showWordmark;

  @override
  Widget build(BuildContext context) {
    // Align with both factors at 1 keeps the mark at exactly `size` in every parent.
    // A bare SizedBox is not enough: inside a Column using CrossAxisAlignment.stretch —
    // which every form screen here does — the child receives a tight full-width
    // constraint, the painter scales to it, and the logo balloons across the screen.
    // The factors also stop it expanding inside a Row with mainAxisSize.min (the app bar).
    final mark = Align(
      widthFactor: 1,
      heightFactor: 1,
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(painter: _SayehMarkPainter()),
      ),
    );

    if (!showWordmark) return mark;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        SizedBox(height: size * 0.18),
        Text(
          'sayeh',
          // Latin wordmark, so Cairo's Arabic subset would fall through to Roboto anyway;
          // naming the fallback directly keeps the letterforms predictable.
          style: TextStyle(
            fontFamily: 'Roboto',
            fontSize: size * 0.34,
            fontWeight: FontWeight.w500,
            letterSpacing: size * 0.055,
            color: Theme.of(context).brightness == Brightness.dark
                ? AppColors.cream
                : AppColors.navy,
          ),
        ),
      ],
    );
  }
}

/// Paints the two interlocking strokes of the mark on a 100x100 grid, scaled to fit.
class _SayehMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 100;
    canvas.save();
    canvas.scale(scale);

    // Upper stroke — the navy hook of the S, sweeping right then curling back left.
    final upper = Path()
      ..moveTo(78, 20)
      ..cubicTo(60, 14, 34, 15, 27, 31)
      ..cubicTo(21, 45, 33, 54, 50, 58)
      ..lineTo(50, 43)
      ..cubicTo(41, 41, 38, 38, 40, 34)
      ..cubicTo(43, 28, 60, 27, 72, 31)
      ..close();

    // Lower stroke — the gold ribbon, mirroring the hook.
    final lower = Path()
      ..moveTo(22, 80)
      ..cubicTo(40, 86, 66, 85, 73, 69)
      ..cubicTo(79, 55, 67, 46, 50, 42)
      ..lineTo(50, 57)
      ..cubicTo(59, 59, 62, 62, 60, 66)
      ..cubicTo(57, 72, 40, 73, 28, 69)
      ..close();

    canvas.drawPath(lower, Paint()..color = AppColors.gold);
    canvas.drawPath(upper, Paint()..color = AppColors.navy);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _SayehMarkPainter oldDelegate) => false;
}
