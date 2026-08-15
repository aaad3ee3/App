import 'package:flutter/material.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:provider/provider.dart';
import '../../models/store_order.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/orders_service.dart';

class OrdersHistoryScreen extends StatefulWidget {
  const OrdersHistoryScreen({super.key});

  @override
  State<OrdersHistoryScreen> createState() => _OrdersHistoryScreenState();
}

class _OrdersHistoryScreenState extends State<OrdersHistoryScreen> {
  late final OrdersService _ordersService;
  List<StoreOrder> _orders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _ordersService = OrdersService(context.read<AuthStore>().api);
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final orders = await _ordersService.listOrders();
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _orders.isEmpty
                  ? Center(child: Text('لا توجد طلبات بعد', style: TextStyle(color: Colors.grey.shade600)))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _orders.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) => _OrderTile(order: _orders[index]),
                      ),
                    ),
    );
  }
}

class _StatusInfo {
  final String label;
  final Color color;
  const _StatusInfo(this.label, this.color);
}

_StatusInfo _statusInfo(String status) {
  switch (status) {
    case 'completed':
      return const _StatusInfo('مكتمل', Colors.green);
    case 'processing':
    case 'pending':
      return _StatusInfo('قيد التنفيذ', Colors.amber.shade800);
    case 'failed':
      return const _StatusInfo('فشل واسترجع المبلغ', Colors.red);
    case 'ambiguous_error':
      return _StatusInfo('قيد المراجعة', Colors.orange.shade800);
    case 'refunded':
      return const _StatusInfo('تم الاسترجاع', Colors.blueGrey);
    default:
      return _StatusInfo(status, Colors.grey.shade700);
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order});

  final StoreOrder order;

  @override
  Widget build(BuildContext context) {
    final status = _statusInfo(order.status);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => showDialog(
          context: context,
          builder: (_) => _OrderDetailDialog(order: order),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(
                order.kind == 'giftcard' ? Icons.card_giftcard_rounded : Icons.trending_up_rounded,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(DateFormat('yyyy/MM/dd — HH:mm').format(order.createdAt.toLocal())),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: status.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                      child: Text(status.label, style: TextStyle(color: status.color, fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
              Text('${order.totalPrice} LYD', style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderDetailDialog extends StatelessWidget {
  const _OrderDetailDialog({required this.order});

  final StoreOrder order;

  @override
  Widget build(BuildContext context) {
    final status = _statusInfo(order.status);
    return AlertDialog(
      title: const Text('تفاصيل الطلب'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _row('الحالة', status.label),
          _row('الكمية', '${order.quantity}'),
          _row('الإجمالي', '${order.totalPrice} LYD'),
          if (order.targetLink != null) _row('الرابط', order.targetLink!),
          if (order.cardCode != null) ...[
            const SizedBox(height: 8),
            const Text('كود البطاقة', style: TextStyle(color: Colors.grey)),
            SelectableText(
              order.cardCode!,
              textDirection: TextDirection.ltr,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
          if (order.errorMessage != null) ...[
            const SizedBox(height: 8),
            Text(order.errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13)),
          ],
        ],
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('إغلاق'))],
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(width: 12),
            Flexible(child: Text(value, textAlign: TextAlign.end)),
          ],
        ),
      );
}
