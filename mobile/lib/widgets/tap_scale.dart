import 'package:flutter/material.dart';

/// Wraps an already-tappable child (a `Card` + `InkWell`, typically) with a subtle
/// press-down scale, so a tap reads as physically responsive on top of the ripple it
/// already has. Uses a [Listener] rather than a `GestureDetector` deliberately — a
/// `Listener` observes pointer events without entering the gesture arena, so it never
/// competes with the child's own `InkWell` for the tap.
class TapScale extends StatefulWidget {
  const TapScale({super.key, required this.child, this.scale = 0.96});

  final Widget child;
  final double scale;

  @override
  State<TapScale> createState() => _TapScaleState();
}

class _TapScaleState extends State<TapScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => setState(() => _pressed = true),
      onPointerUp: (_) => setState(() => _pressed = false),
      onPointerCancel: (_) => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? widget.scale : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
