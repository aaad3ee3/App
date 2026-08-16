import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/product.dart';
import '../../models/store_order.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/app_config.dart';
import '../../services/orders_service.dart';

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

  int get _minQuantity => widget.product.minQuantity ?? 1;
  int get _maxQuantity => widget.product.maxQuantity ?? 1000000;

  double get _computedTotal {
    final qty = int.tryParse(_quantityController.text) ?? 0;
    return (widget.product.priceValue / 1000) * qty;
  }

  @override
  void initState() {
    super.initState();
    _ordersService = OrdersService(context.read<AuthStore>().api);
    _quantityController = TextEditingController(text: '$_minQuantity');
    _quantityController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _quantityController.dispose();
    _linkController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final order = await _ordersService.createOrder(
        productId: widget.product.id,
        quantity: int.parse(_quantityController.text),
        targetLink: _linkController.text.trim(),
      );
      if (!mounted) return;
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
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.product.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            '${widget.product.price} ${widget.product.currency} لكل 1000 — الكمية من $_minQuantity إلى $_maxQuantity',
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
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('الإجمالي المتوقع'),
                  Text(
                    '${_computedTotal.toStringAsFixed(3)} LYD',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
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
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('اطلب الآن'),
          ),
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
          'الكمية: ${order.quantity} — الإجمالي: ${order.totalPrice} LYD',
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
