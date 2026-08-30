import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:lottie/lottie.dart';
import '../theme/app_theme.dart';

/// A centered "nothing here yet" or "something went wrong" message, reused across every
/// screen that used to hand-roll its own version of this (store categories, search
/// results, orders history) — one place to keep them visually consistent.
///
/// [lottieAsset] is only for a genuinely *empty* state (no orders yet, no results) — an
/// error state (`icon: Icons.wifi_off_rounded`) stays a plain icon so "nothing here" and
/// "something's broken" never look the same. If the asset fails to parse or load for any
/// reason, this falls back to [icon] rather than showing nothing or throwing — a shipped
/// screen must never depend on one animation file rendering correctly.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.lottieAsset,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;
  final String? lottieAsset;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildVisual(context)
                .animate()
                .fadeIn(duration: 380.ms, curve: Curves.easeOut)
                .scale(begin: const Offset(0.85, 0.85), curve: Curves.easeOutBack, duration: 420.ms),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ).animate().fadeIn(delay: 120.ms, duration: 320.ms),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
              ).animate().fadeIn(delay: 180.ms, duration: 320.ms),
            ],
            if (action != null) ...[const SizedBox(height: 14), action!],
          ],
        ),
      ),
    );
  }

  Widget _buildVisual(BuildContext context) {
    if (lottieAsset == null) {
      return Icon(icon, size: 52, color: AppColors.gold.withValues(alpha: 0.6));
    }
    return SizedBox(
      width: 130,
      height: 130,
      child: Lottie.asset(
        lottieAsset!,
        repeat: true,
        errorBuilder: (_, _, _) => Icon(icon, size: 52, color: AppColors.gold.withValues(alpha: 0.6)),
      ),
    );
  }
}
