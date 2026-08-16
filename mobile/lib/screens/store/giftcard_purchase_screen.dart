import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/product.dart';
import '../../models/store_order.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/app_config.dart';
import '../../services/orders_service.dart';

class GiftcardPurchaseScreen extends StatefulWidget {
  const GiftcardPurchaseScreen({super.key, required this.product});

  final StoreProduct product;

  @override
  State<GiftcardPurchaseScreen> createState() => _GiftcardPurchaseScreenState();
}

class _GiftcardPurchaseScreenState extends State<GiftcardPurchaseScreen> {
  late final OrdersService _ordersService;
  bool _submitting = false;
  String? _error;
  StoreOrder? _result;

  @override
  void initState() {
    super.initState();
    _ordersService = OrdersService(context.read<AuthStore>().api);
  }

  Future<void> _confirmPurchase() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('تأكيد الشراء'),
        content: Text('راح يتم خصم ${widget.product.price} ${widget.product.currency} من محفظتك مقابل "${widget.product.name}". متأكد؟'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('تأكيد')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final order = await _ordersService.createOrder(productId: widget.product.id);
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
          child: _result != null ? _ResultView(order: _result!) : _buildForm(),
        ),
      ),
    );
  }

  Widget _buildForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.product.image != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                widget.product.image!,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(color: Colors.grey.shade200),
              ),
            ),
          ),
        const SizedBox(height: 16),
        Text(widget.product.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        if (widget.product.description?.isNotEmpty == true) ...[
          const SizedBox(height: 8),
          Text(widget.product.description!, style: TextStyle(color: Colors.grey.shade700)),
        ],
        const SizedBox(height: 20),
        Card(
          color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.4),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('السعر'),
                Text(
                  '${widget.product.price} ${widget.product.currency}',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        // Answers the question every customer has before paying and none of our
        // competitors leaves unanswered: when do I get it?
        Row(
          children: [
            Icon(Icons.schedule_rounded, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'التسليم عادةً خلال ${context.watch<AppConfigStore>().config.giftcardMinutes} دقائق — يظهر الكود في "طلباتي"',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
              ),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _submitting ? null : _confirmPurchase,
          child: _submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('اشتري الآن'),
        ),
      ],
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView({required this.order});

  final StoreOrder order;

  @override
  Widget build(BuildContext context) {
    final isCompleted = order.status == 'completed';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Icon(
          isCompleted ? Icons.check_circle_rounded : Icons.hourglass_top_rounded,
          size: 64,
          color: isCompleted ? Colors.green : Colors.amber.shade700,
        ),
        const SizedBox(height: 16),
        Text(
          isCompleted ? 'تمت عملية الشراء بنجاح' : 'طلبك قيد المعالجة',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 20),
        if (isCompleted && order.cardCode != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('كود البطاقة', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 6),
                  SelectableText(
                    order.cardCode!,
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 1.2),
                    textDirection: TextDirection.ltr,
                  ),
                ],
              ),
            ),
          )
        else if (!isCompleted)
          Text(
            'راح تستلم إشعار بمجرد اكتمال طلبك. تقدر تتابع الحالة من "طلباتي".',
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
