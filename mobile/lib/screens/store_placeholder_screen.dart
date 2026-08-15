import 'package:flutter/material.dart';

/// The catalog (gift cards + SMM/growth services) depends on the Libya Play and Plus
/// supplier adapters, which are stubbed on the backend pending real API docs — see
/// backend/src/adapters/. This screen is an honest placeholder until that phase ships.
class StorePlaceholderScreen extends StatelessWidget {
  const StorePlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.storefront_outlined, size: 72, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            const Text(
              'المتجر قريبًا',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'بطاقات الألعاب الدولية وخدمات زيادة المتابعين والمشاهدات راح تكون متاحة هنا قريبًا.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}
