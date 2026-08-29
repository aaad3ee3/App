import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/topup_request.dart';
import '../../models/wallet.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/topup_service.dart';
import '../../services/wallet_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/glow_blob.dart';
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
  bool _loadingMore = false;
  bool _hasMore = false;
  int _page = 1;
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
        _walletService.getTransactions(page: 1),
        _topupService.list(),
      ]);
      final balance = results[0] as WalletBalance;
      final transactionsPage = results[1] as ({List<WalletTransaction> items, bool hasMore});
      final topups = results[2] as List<TopupRequest>;
      if (!mounted) return;
      setState(() {
        _balance = balance;
        _transactions = transactionsPage.items;
        _hasMore = transactionsPage.hasMore;
        _page = 1;
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

  Future<void> _loadMore() async {
    setState(() => _loadingMore = true);
    try {
      final nextPage = await _walletService.getTransactions(page: _page + 1);
      if (!mounted) return;
      setState(() {
        _transactions = [..._transactions, ...nextPage.items];
        _hasMore = nextPage.hasMore;
        _page += 1;
        _loadingMore = false;
      });
    } on ApiException {
      if (!mounted) return;
      setState(() => _loadingMore = false);
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
                child: Text('لا توجد حركات بعد', style: TextStyle(color: AppColors.textSecondary)),
              ),
            )
          else ...[
            ..._transactions.map((t) => _TransactionTile(transaction: t)),
            if (_hasMore) ...[
              const SizedBox(height: 4),
              Center(
                child: _loadingMore
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                      )
                    : OutlinedButton(onPressed: _loadMore, child: const Text('تحميل المزيد')),
              ),
            ],
          ],
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
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppTheme.radiusLg),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AppColors.navy, AppColors.navyDark],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.navy.withValues(alpha: 0.22),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Stack(
          children: [
            // Two soft glows in opposite corners — the same technique behind the
            // top-of-screen ambient glow, scaled down onto a single card. Gold rather
            // than a low-alpha neutral tone: a grey/white glow over navy read as a
            // smudge in testing, gold keeps its color even faint.
            const Positioned(top: -40, right: -30, child: GlowBlob(size: 120, alpha: 0.14)),
            const Positioned(bottom: -50, left: -40, child: GlowBlob(size: 150, alpha: 0.10)),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'رصيد المحفظة',
                      style: TextStyle(color: AppColors.cream.withValues(alpha: 0.82), fontSize: 14),
                    ),
                    const Spacer(),
                    const Icon(Icons.account_balance_wallet_rounded, color: AppColors.goldLight, size: 20),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  textBaseline: TextBaseline.alphabetic,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  children: [
                    Text(
                      balance?.amount.toStringAsFixed(2) ?? '0.00',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 38,
                        fontWeight: FontWeight.w800,
                        height: 1.1,
                        shadows: [Shadow(color: AppColors.gold.withValues(alpha: 0.45), blurRadius: 18)],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      balance?.currency ?? 'LYD',
                      style: const TextStyle(
                        color: AppColors.goldLight,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                    boxShadow: [BoxShadow(color: AppColors.gold.withValues(alpha: 0.35), blurRadius: 18, spreadRadius: 1)],
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: onTopupPressed,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.gold,
                        foregroundColor: Colors.white,
                      ),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('شحن الرصيد'),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
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
      color: AppColors.warningBg,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Icon(Icons.hourglass_top_rounded, color: AppColors.warning),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      topup.requestedAmount != null
                          ? 'طلب شحن بقيمة ${topup.requestedAmount} بانتظار التحويل'
                          : 'طلب شحن بانتظار التحويل',
                      // warningBg is always the same pale cream regardless of light/dark
                      // theme — text left at the ambient default color turned nearly
                      // invisible in dark mode, where that default is a light color too.
                      // Fixed, non-theme-dependent text colors here since the background
                      // is fixed too.
                      style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'اضغط لعرض تفاصيل التحويل',
                      style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_left_rounded, color: AppColors.textSecondary),
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
    final color = isCredit ? AppColors.success : AppColors.danger;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: (isCredit ? AppColors.successBg : AppColors.dangerBg),
          child: Icon(isCredit ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, color: color),
        ),
        title: Text(_typeLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(
          DateFormat('yyyy/MM/dd — HH:mm').format(transaction.createdAt.toLocal()),
          style: const TextStyle(fontSize: 12.5),
        ),
        trailing: Text(
          '${isCredit ? '+' : ''}${transaction.amount}',
          style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
    );
  }
}
