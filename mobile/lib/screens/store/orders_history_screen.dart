import 'package:flutter/material.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:provider/provider.dart';
import '../../models/store_order.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/app_config.dart';
import '../../services/orders_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/money.dart';

class OrdersHistoryScreen extends StatefulWidget {
  const OrdersHistoryScreen({super.key, this.embedded = false});

  /// True when shown as a tab inside HomeShell, which already supplies the Scaffold and
  /// the app bar. Pushed as its own route (from the profile screen) it needs both, hence
  /// the flag rather than two near-identical widgets.
  final bool embedded;

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
    final body = _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
            ? _OrdersMessage(
                icon: Icons.wifi_off_rounded,
                title: _error!,
                action: OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
              )
            : _orders.isEmpty
                ? _OrdersMessage(
                    icon: Icons.receipt_long_rounded,
                    title: 'لا توجد طلبات بعد',
                    subtitle: 'أول ما تشتري بطاقة أو تطلب خدمة، راح تلقاها هنا مع الكود وحالة الطلب.',
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: AnimationLimiter(
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _orders.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) => AnimationConfiguration.staggeredList(
                          position: index,
                          duration: const Duration(milliseconds: 380),
                          child: SlideAnimation(
                            verticalOffset: 30,
                            curve: Curves.easeOutCubic,
                            child: FadeInAnimation(
                              child: _OrderTile(order: _orders[index]),
                            ),
                          ),
                        ),
                      ),
                    ),
                  );

    if (widget.embedded) return body;
    return Scaffold(appBar: AppBar(title: const Text('طلباتي')), body: body);
  }
}

/// Empty/error state for the orders list. An empty orders tab is the first thing a brand
/// new customer sees after signing up, so it explains what will appear here rather than
/// leaving them on a bare "no orders" line wondering whether something broke.
class _OrdersMessage extends StatelessWidget {
  const _OrdersMessage({required this.icon, required this.title, this.subtitle, this.action});

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: AppColors.gold.withValues(alpha: 0.45)),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13.5),
              ),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
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
              Text('${formatLydString(order.totalPrice)} LYD', style: const TextStyle(fontWeight: FontWeight.bold)),
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
    final whatsappUrl = context.watch<AppConfigStore>().config.whatsappUrl;
    return AlertDialog(
      title: const Text('تفاصيل الطلب'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _row('الحالة', status.label),
          _row('الكمية', '${order.quantity}'),
          _row('الإجمالي', '${formatLydString(order.totalPrice)} LYD'),
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
          if (order.status == 'ambiguous_error') ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.warningBg,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: const Text(
                'مبلغ الطلب محجوز ولم يُخصم نهائياً. نتأكد من حالته مع المورّد، وإما ننفّذه أو نرجّع المبلغ كاملاً لمحفظتك.',
                style: TextStyle(fontSize: 13, color: AppColors.warning),
              ),
            ),
          ],
        ],
      ),
      actions: [
        // An order held for review is precisely when a customer needs to reach a human:
        // their money is committed and the app cannot yet tell them the outcome.
        if (order.status == 'ambiguous_error' && whatsappUrl != null)
          TextButton.icon(
            onPressed: () => launchUrl(Uri.parse(whatsappUrl), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.support_agent_rounded, size: 18),
            label: const Text('تواصل مع الدعم'),
          ),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('إغلاق')),
      ],
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
