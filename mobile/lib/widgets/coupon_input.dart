import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../services/auth_store.dart';
import '../services/coupons_service.dart';
import '../theme/app_theme.dart';

/// Optional discount-code field for a checkout screen. Applying a code calls the
/// non-binding preview endpoint (coupons.routes.ts `/coupons/preview`) purely to show the
/// discount before purchase — the real, atomic claim happens server-side inside
/// `createOrder` itself, so this widget only ever hands the raw code up to the caller.
class CouponInput extends StatefulWidget {
  const CouponInput({
    super.key,
    required this.productId,
    required this.quantity,
    required this.onQuoteChanged,
  });

  final String productId;
  final int quantity;

  /// Called with the applied code and its quote, or (null, null) once cleared/invalidated.
  final void Function(String? code, CouponQuote? quote) onQuoteChanged;

  @override
  State<CouponInput> createState() => _CouponInputState();
}

class _CouponInputState extends State<CouponInput> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;
  CouponQuote? _quote;
  String? _appliedCode;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final code = _controller.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final service = CouponsService(context.read<AuthStore>().api);
      final quote = await service.preview(code: code, productId: widget.productId, quantity: widget.quantity);
      if (!mounted) return;
      setState(() {
        _quote = quote;
        _appliedCode = code;
        _loading = false;
      });
      widget.onQuoteChanged(code, quote);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _quote = null;
        _appliedCode = null;
        _loading = false;
      });
      widget.onQuoteChanged(null, null);
    }
  }

  void _clear() {
    _controller.clear();
    setState(() {
      _quote = null;
      _appliedCode = null;
      _error = null;
    });
    widget.onQuoteChanged(null, null);
  }

  @override
  Widget build(BuildContext context) {
    if (_appliedCode != null && _quote != null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.successBg,
          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        ),
        child: Row(
          children: [
            const Icon(Icons.local_offer_rounded, color: AppColors.success, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'كود "$_appliedCode" — خصم ${_quote!.discountAmount.toStringAsFixed(2)} د.ل',
                style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.w700, fontSize: 13),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.success),
              onPressed: _clear,
              tooltip: 'إلغاء الكود',
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                textDirection: TextDirection.ltr,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(isDense: true, hintText: 'كود خصم (اختياري)'),
                onSubmitted: (_) => _apply(),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: _loading ? null : _apply,
              child: _loading
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('تطبيق'),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 4),
          Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
        ],
      ],
    );
  }
}
