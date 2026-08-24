import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../models/product.dart';
import '../../models/store_order.dart';
import '../../models/wallet.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/app_config.dart';
import '../../services/coupons_service.dart';
import '../../services/orders_service.dart';
import '../../services/wallet_service.dart';
import '../../utils/money.dart';
import '../../widgets/balance_warning_card.dart';
import '../../widgets/coupon_input.dart';
import '../../widgets/secure_payment_badge.dart';
import '../../widgets/sign_in_gate.dart';
import '../topup/topup_screen.dart';

class SmmPurchaseScreen extends StatefulWidget {
  const SmmPurchaseScreen({super.key, required this.product});

  final StoreProduct product;

  @override
  State<SmmPurchaseScreen> createState() => _SmmPurchaseScreenState();
}

class _SmmPurchaseScreenState extends State<SmmPurchaseScreen> {
  late final OrdersService _ordersService;
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _quantityController;
  final _linkController = TextEditingController();

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
    return (widget.product.priceValue / 1000) * qty;
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
          // Any quantity change invalidates a previously-applied coupon quote — its
          // discount was computed against the old total.
          _couponCode = null;
          _couponQuote = null;
        }));
    if (!auth.isGuest) {
      WalletService(auth.api).getBalance().then((w) {
        if (mounted) setState(() => _wallet = w);
      }).catchError((_) {});
    }
  }

  @override
  void dispose() {
    _quantityController.dispose();
    _linkController.dispose();
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
    // Guests get the reason before the wall, not a 401 after it.
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
        targetLink: _linkController.text.trim(),
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
          child: _result != null ? _SmmResultView(order: _result!) : _buildForm(),
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
            '${widget.product.formattedPrice} ${widget.product.currency} لكل 1000 — الكمية من $_minQuantity إلى $_maxQuantity',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 20),
          TextFormField(
            controller: _linkController,
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(labelText: 'الرابط أو اسم المستخدم'),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'هذا الحقل مطلوب' : null,
          ),
          const SizedBox(height: 16),
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
          // SMM orders can take hours, so saying so up front prevents the "I paid and
          // nothing happened" support message an hour later.
          Row(
            children: [
              Icon(Icons.schedule_rounded, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'يبدأ التنفيذ خلال دقائق ويكتمل عادةً خلال ${context.watch<AppConfigStore>().config.smmHours} ساعة',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'تأكد من صحة الرابط — التنفيذ يتم على ما أدخلته ولا يمكن التراجع عنه.',
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
                : const Text('اطلب الآن'),
          ),
          const SizedBox(height: 10),
          const SecurePaymentBadge(),
        ],
      ),
    );
  }
}

class _SmmResultView extends StatelessWidget {
  const _SmmResultView({required this.order});

  final StoreOrder order;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Icon(Icons.hourglass_top_rounded, size: 64, color: Colors.amber.shade700),
        const SizedBox(height: 16),
        const Text('تم إرسال طلبك', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
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
