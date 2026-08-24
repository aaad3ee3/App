import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Tells a customer their wallet balance won't cover this purchase before they hit
/// confirm and hit a server error instead — with the one thing they actually need to do
/// about it right there.
class BalanceWarningCard extends StatelessWidget {
  const BalanceWarningCard({super.key, required this.balance, required this.required, required this.onTopUp});

  final double balance;
  final double required;
  final VoidCallback onTopUp;

  @override
  Widget build(BuildContext context) {
    final missing = required - balance;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.warningBg,
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      ),
      child: Row(
        children: [
          const Icon(Icons.account_balance_wallet_outlined, color: AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'رصيدك ${balance.toStringAsFixed(2)} د.ل ما يكفي لهذا الطلب',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.warning, fontSize: 13.5),
                ),
                const SizedBox(height: 2),
                Text(
                  'ناقصك ${missing.toStringAsFixed(2)} د.ل — اشحن رصيدك عشان تكمل',
                  style: const TextStyle(fontSize: 12, color: AppColors.warning),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.warning,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            onPressed: onTopUp,
            child: const Text('اشحن الآن', style: TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
