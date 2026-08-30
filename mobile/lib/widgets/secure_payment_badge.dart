import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A small trust signal shown right above the confirm button — the moment a customer is
/// about to commit money is exactly when a "this is safe" cue is worth the pixel.
class SecurePaymentBadge extends StatelessWidget {
  const SecurePaymentBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.lock_rounded, size: 14, color: Theme.of(context).colorScheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Text(
          'عملية دفع محمية داخل تطبيق سايح',
          style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}
