import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../models/product.dart';
import '../../models/store_order.dart';
import '../../models/wallet.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/coupons_service.dart';
import '../../services/orders_service.dart';
import '../../services/wallet_service.dart';
import '../../utils/money.dart';
import '../../widgets/balance_warning_card.dart';
import '../../widgets/coupon_input.dart';
import '../../widgets/secure_payment_badge.dart';
import '../../widgets/sign_in_gate.dart';
import '../topup/topup_screen.dart';

/// Checkout for a "live app" top-up — Azal Live, Party Star, imo and similar broadcast
/// apps synced from Libya Play's /social/* flow. Unlike an SMM order (a link/username) or
/// a gift card (an instant code), this kind asks for one or more platform-specific fields
/// (product.requiredParams, e.g. "معرف المستخدم") and credits the account asynchronously —
/// so the result screen reads "قيد التنفيذ", never an instant success.
class SocialTopupPurchaseScreen extends StatefulWidget {
  const SocialTopupPurchaseScreen({super.key, required this.product});

  final StoreProduct product;

  @override
  State<SocialTopupPurchaseScreen> createState() => _SocialTopupPurchaseScreenState();
}

class _SocialTopupPurchaseScreenState extends State<SocialTopupPurchaseScreen> {
  late final OrdersService _ordersService;
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _quantityController;
  late final Map<String, TextEditingController> _paramControllers;

  bool _submitting = false;
  String? _error;
  StoreOrder? _result;

  WalletBalance? _wallet;
  String? _couponCode;
  CouponQuote? _couponQuote;

  int get _minQuantity => widget.product.minQuantity ?? 1;
  int get _maxQuantity => widget.product.maxQuantity ?? 1000000;

  double get _computedTotal {
    final qty = int.tryParse(_quantityController.text) ?? 0;
    return widget.product.priceValue * qty; // per-unit rate, NOT per-1000 like smm.
  }

  double get _finalTotal => _couponQuote?.totalAfterDiscount ?? _computedTotal;

  int get _currentQuantity => int.tryParse(_quantityController.text) ?? _minQuantity;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthStore>();
    _ordersService = OrdersService(auth.api);
    _quantityController = TextEditingController(text: '$_minQuantity');
    _quantityController.addListener(() => setState(() {
          _couponCode = null;
          _couponQuote = null;
        }));
    _paramControllers = {for (final label in widget.product.requiredParams) label: TextEditingController()};
    if (!auth.isGuest) {
      WalletService(auth.api).getBalance().then((w) {
        if (mounted) setState(() => _wallet = w);
      }).catchError((_) {});
    }
  }

  @override
  void dispose() {
    _quantityController.dispose();
    for (final controller in _paramControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _goToTopup() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TopupScreen()));
    final auth = context.read<AuthStore>();
    if (!auth.isGuest && mounted) {
      WalletService(auth.api).getBalance().then((w) {
        if (mounted) setState(() => _wallet = w);
      }).catchError((_) {});
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (!await ensureSignedInToBuy(context)) return;
    if (!mounted) return;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final order = await _ordersService.createOrder(
        productId: widget.product.id,
        quantity: int.parse(_quantityController.text),
        socialParams: {for (final entry in _paramControllers.entries) entry.key: entry.value.text.trim()},
        couponCode: _couponCode,
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      setState(() {
        _result = order;
        _submitting = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.product.name)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: _result != null ? _SocialTopupResultView(order: _result!) : _buildForm(),
        ),
      ),
    );
  }

  Widget _buildForm() {
    final insufficientBalance = _wallet != null && _wallet!.amount < _finalTotal;

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.product.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            '${widget.product.formattedPrice} ${widget.product.currency} للوحدة — الكمية من $_minQuantity إلى $_maxQuantity',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 20),
          for (final label in widget.product.requiredParams) ...[
            TextFormField(
              controller: _paramControllers[label],
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: label),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'هذا الحقل مطلوب' : null,
            ),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: _quantityController,
            keyboardType: TextInputType.number,
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(labelText: 'الكمية'),
            validator: (v) {
              final n = int.tryParse(v ?? '');
              if (n == null) return 'أدخل رقمًا صحيحًا';
              if (n < _minQuantity) return 'الحد الأدنى $_minQuantity';
              if (n > _maxQuantity) return 'الحد الأقصى $_maxQuantity';
              return null;
            },
          ),
          const SizedBox(height: 20),
          Card(
            color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.4),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(_couponQuote != null ? 'الإجمالي قبل الخصم' : 'الإجمالي المتوقع'),
                      Text(
                        '${formatLyd(_computedTotal)} LYD',
                        style: TextStyle(
                          fontSize: _couponQuote != null ? 15 : 20,
                          fontWeight: FontWeight.bold,
                          decoration: _couponQuote != null ? TextDecoration.lineThrough : null,
                          color: _couponQuote != null ? Theme.of(context).colorScheme.onSurfaceVariant : null,
                        ),
                      ),
                    ],
                  ),
                  if (_couponQuote != null) ...[
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('الإجمالي بعد الخصم', style: TextStyle(fontWeight: FontWeight.w700)),
                        Text('${formatLyd(_finalTotal)} LYD', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          CouponInput(
            key: ValueKey(_currentQuantity),
            productId: widget.product.id,
            quantity: _currentQuantity,
            onQuoteChanged: (code, quote) => setState(() {
              _couponCode = code;
              _couponQuote = quote;
            }),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.schedule_rounded, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'الشحن يتم على مدار الساعة تلقائياً — راح يوصلك إشعار بمجرد الاكتمال',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'تأكد من صحة البيانات المدخلة — الشحن يتم عليها ولا يمكن التراجع عنه.',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12.5),
          ),
          if (insufficientBalance) ...[
            const SizedBox(height: 16),
            BalanceWarningCard(balance: _wallet!.amount, required: _finalTotal, onTopUp: _goToTopup),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: (_submitting || insufficientBalance) ? null : _submit,
            child: _submitting
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('اشحن الآن'),
          ),
          const SizedBox(height: 10),
          const SecurePaymentBadge(),
        ],
      ),
    );
  }
}

class _SocialTopupResultView extends StatelessWidget {
  const _SocialTopupResultView({required this.order});

  final StoreOrder order;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Icon(Icons.hourglass_top_rounded, size: 64, color: Colors.amber.shade700),
        const SizedBox(height: 16),
        const Text('تم إرسال طلب الشحن', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(
          'الكمية: ${order.quantity} — الإجمالي: ${formatLydString(order.totalPrice)} LYD',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey.shade600),
        ),
        const SizedBox(height: 8),
        Text(
          'الطلب قيد التنفيذ وراح يتحدث تلقائياً. تقدر تتابع حالته من "طلباتي".',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey.shade600),
        ),
        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
          child: const Text('رجوع للمتجر'),
        ),
      ],
    );
  }
}
