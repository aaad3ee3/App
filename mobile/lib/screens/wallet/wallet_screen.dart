import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/topup_request.dart';
import '../../models/wallet.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/topup_service.dart';
import '../../services/wallet_service.dart';
import '../topup/topup_screen.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  late final WalletService _walletService;
  late final TopupService _topupService;

  WalletBalance? _balance;
  List<WalletTransaction> _transactions = [];
  TopupRequest? _pendingTopup;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthStore>().api;
    _walletService = WalletService(api);
    _topupService = TopupService(api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _walletService.getBalance(),
        _walletService.getTransactions(),
        _topupService.list(),
      ]);
      final balance = results[0] as WalletBalance;
      final transactions = results[1] as List<WalletTransaction>;
      final topups = results[2] as List<TopupRequest>;
      if (!mounted) return;
      setState(() {
        _balance = balance;
        _transactions = transactions;
        _pendingTopup = topups.where((t) => t.isPending).isEmpty
            ? null
            : topups.firstWhere((t) => t.isPending);
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

  Future<void> _goToTopup() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TopupScreen()));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _balance == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _balance == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _BalanceCard(balance: _balance, onTopupPressed: _goToTopup),
          if (_pendingTopup != null) ...[
            const SizedBox(height: 16),
            _PendingTopupBanner(topup: _pendingTopup!, onTap: _goToTopup),
          ],
          const SizedBox(height: 24),
          Text('آخر الحركات', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (_transactions.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text('لا توجد حركات بعد', style: TextStyle(color: Colors.grey.shade600)),
              ),
            )
          else
            ..._transactions.map((t) => _TransactionTile(transaction: t)),
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.balance, required this.onTopupPressed});

  final WalletBalance? balance;
  final VoidCallback onTopupPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [scheme.primary, scheme.primary.withValues(alpha: 0.8)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('رصيد المحفظة', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 14)),
          const SizedBox(height: 8),
          Text(
            '${balance?.amount.toStringAsFixed(2) ?? '0.00'} ${balance?.currency ?? 'LYD'}',
            style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onTopupPressed,
              style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: scheme.primary),
              icon: const Icon(Icons.add_circle_outline),
              label: const Text('شحن الرصيد'),
            ),
          ),
        ],
      ),
    );
  }
}

class _PendingTopupBanner extends StatelessWidget {
  const _PendingTopupBanner({required this.topup, required this.onTap});

  final TopupRequest topup;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.amber.shade50,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.hourglass_top_rounded, color: Colors.amber.shade800),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'طلب شحن بقيمة ${topup.requestedAmount} بانتظار التحويل',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    const Text('اضغط لعرض تفاصيل التحويل', style: TextStyle(fontSize: 13)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_left_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({required this.transaction});

  final WalletTransaction transaction;

  String get _typeLabel {
    switch (transaction.type) {
      case 'topup_credit':
        return 'شحن رصيد';
      case 'order_debit':
        return 'عملية شراء';
      case 'refund':
        return 'استرجاع';
      case 'admin_adjustment':
        return 'تعديل إداري';
      default:
        return transaction.type;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCredit = transaction.isCredit;
    final color = isCredit ? Colors.green.shade700 : Colors.red.shade700;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.1),
          child: Icon(isCredit ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, color: color),
        ),
        title: Text(_typeLabel),
        subtitle: Text(DateFormat('yyyy/MM/dd — HH:mm').format(transaction.createdAt.toLocal())),
        trailing: Text(
          '${isCredit ? '+' : ''}${transaction.amount}',
          style: TextStyle(color: color, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
