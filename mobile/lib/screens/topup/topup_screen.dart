import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:provider/provider.dart';
import '../../config/store_config.dart';
import '../../models/topup_request.dart';
import '../../services/api_client.dart';
import '../../services/app_config.dart';
import '../../services/auth_store.dart';
import '../../services/binance_topup_service.dart';
import '../../services/topup_service.dart';
import '../../theme/app_theme.dart';
import '../auth/link_phone_screen.dart';

enum _TopupMethod { libyana, binance }

class TopupScreen extends StatefulWidget {
  const TopupScreen({super.key});

  @override
  State<TopupScreen> createState() => _TopupScreenState();
}

class _TopupScreenState extends State<TopupScreen> {
  late final TopupService _topupService;
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();

  TopupRequest? _pending;
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  _TopupMethod _method = _TopupMethod.libyana;

  @override
  void initState() {
    super.initState();
    _topupService = TopupService(context.read<AuthStore>().api);
    _load();
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _openLinkPhone() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LinkPhoneScreen()));
    // AuthStore already updated its user on success and notified listeners — this
    // screen watches it in build(), so nothing further to do here either way.
  }

  Future<void> _copyStoreNumber() async {
    await Clipboard.setData(const ClipboardData(text: StoreConfig.libyanaTopupPhoneNumber));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم نسخ الرقم')));
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final topups = await _topupService.list();
      final pending = topups.where((t) => t.isPending).toList();
      if (!mounted) return;
      setState(() {
        _pending = pending.isEmpty ? null : pending.first;
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

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final phone = context.read<AuthStore>().user?.phone;
    if (phone == null) return; // build() only shows this form once a phone is linked.
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final amountText = _amountController.text.trim();
      final topup = await _topupService.create(
        senderPhone: phone,
        amount: amountText.isEmpty ? null : double.parse(amountText),
      );
      if (!mounted) return;
      setState(() {
        _pending = topup;
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

  Future<void> _cancel() async {
    final pending = _pending;
    if (pending == null) return;
    setState(() => _submitting = true);
    try {
      await _topupService.cancel(pending.id);
      if (!mounted) return;
      setState(() {
        _pending = null;
        _submitting = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final phone = context.watch<AuthStore>().user?.phone;
    final binanceEnabled = context.watch<AppConfigStore>().config.binancePayEnabled;

    return Scaffold(
      appBar: AppBar(title: const Text('شحن الرصيد')),
      body: SafeArea(
        child: Column(
          children: [
            if (binanceEnabled)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: SegmentedButton<_TopupMethod>(
                  segments: const [
                    ButtonSegment(value: _TopupMethod.libyana, label: Text('ليبيانا'), icon: Icon(Icons.phone_android_rounded)),
                    ButtonSegment(value: _TopupMethod.binance, label: Text('Binance Pay'), icon: Icon(Icons.attach_money_rounded)),
                  ],
                  selected: {_method},
                  onSelectionChanged: (s) => setState(() => _method = s.first),
                ),
              ),
            Expanded(
              child: _method == _TopupMethod.binance
                  ? const SingleChildScrollView(padding: EdgeInsets.all(16), child: _BinanceTopupView())
                  : (_loading
                      ? const Center(child: CircularProgressIndicator())
                      : SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: _pending != null
                              ? _PendingView(topup: _pending!, submitting: _submitting, onCancel: _cancel)
                              : (phone == null ? _buildLinkPhonePrompt() : _buildForm(phone)),
                        )),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLinkPhonePrompt() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.phone_android_rounded, size: 56, color: AppColors.gold),
        const SizedBox(height: 16),
        Text(
          'اربط رقم هاتفك أولاً',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'عشان نطابق تحويلك تلقائياً، لازم تربط وتأكّد رقم ليبيانا اللي راح تحول منه — مرة وحدة بس، وبعدها يستخدم لكل عمليات الشحن.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14),
        ),
        const SizedBox(height: 24),
        FilledButton(onPressed: _openLinkPhone, child: const Text('ربط رقم الهاتف')),
      ],
    );
  }

  Widget _buildForm(String phone) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Card 1: the customer's own verified number — this is the number the
          // matcher will look for as the transfer's sender, so showing it up front
          // makes clear whose transfer counts.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.person_outline_rounded, color: AppColors.navy),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('رقم هاتفك المسجل', style: TextStyle(fontSize: 12.5, color: Colors.grey)),
                        const SizedBox(height: 2),
                        Text(
                          phone,
                          textDirection: TextDirection.ltr,
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.successBg,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.verified_rounded, size: 14, color: AppColors.success),
                        SizedBox(width: 4),
                        Text('موثق', style: TextStyle(fontSize: 12, color: AppColors.success, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'الرجاء التحويل من هذا الرقم فقط لتجنب رفض العملية.',
              style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ),
          const SizedBox(height: 16),

          // Card 2: the store's own Libyana number, with one-tap copy — this is where
          // the transfer actually goes.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('قم بالتحويل إلى هذا الرقم', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Text(
                            StoreConfig.libyanaTopupPhoneNumber,
                            textDirection: TextDirection.ltr,
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _copyStoreNumber,
                        icon: const Icon(Icons.copy_rounded),
                        tooltip: 'نسخ الرقم',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(
              labelText: 'المبلغ (اختياري)',
              hintText: 'اتركه فاضي إذا ما تعرف المبلغ بالضبط',
            ),
            // Optional: an empty field is valid — see topup_service.dart's `create`.
            validator: (v) {
              final text = (v ?? '').trim();
              if (text.isEmpty) return null;
              final n = double.tryParse(text);
              if (n == null || n <= 0) return 'أدخل مبلغًا صحيحًا أو اتركه فاضي';
              return null;
            },
          ),
          const SizedBox(height: 6),
          Text(
            'لو تركته فاضي، راح نشحن رصيدك بنفس المبلغ اللي تحوّله فعلياً — مهما كان.',
            style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.check_rounded),
            label: Text(_submitting ? 'جارٍ التنفيذ…' : 'تأكيد العملية'),
          ),
          const SizedBox(height: 8),
          Text(
            'بعد التأكيد، إذا تطابق رقمك والمبلغ مع تحويل فعلي، راح يضاف الرصيد تلقائياً خلال دقائق.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _PendingView extends StatelessWidget {
  const _PendingView({required this.topup, required this.submitting, required this.onCancel});

  final TopupRequest topup;
  final bool submitting;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.4),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.info_outline_rounded),
                    const SizedBox(width: 8),
                    Text('تعليمات التحويل', style: Theme.of(context).textTheme.titleMedium),
                  ],
                ),
                const SizedBox(height: 16),
                _InstructionStep(number: 1, text: 'افتح تطبيق ليبيانا أو *121# من رقمك ${topup.senderPhone}'),
                _InstructionStep(
                  number: 2,
                  text: topup.requestedAmount != null
                      ? 'حوّل مبلغ ${topup.requestedAmount} دينار إلى الرقم:\n${StoreConfig.libyanaTopupPhoneNumber}'
                      : 'حوّل أي مبلغ تحب إلى الرقم:\n${StoreConfig.libyanaTopupPhoneNumber}',
                ),
                const _InstructionStep(number: 3, text: 'راح يتم شحن رصيدك تلقائيًا خلال دقائق من التحويل'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        _StatusRow(label: 'الحالة', value: 'بانتظار التحويل'),
        _StatusRow(label: 'صالح حتى', value: DateFormat('yyyy/MM/dd — HH:mm').format(topup.expiresAt.toLocal())),
        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: submitting ? null : onCancel,
          style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
          child: submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('إلغاء طلب الشحن'),
        ),
      ],
    );
  }
}

class _InstructionStep extends StatelessWidget {
  const _InstructionStep({required this.number, required this.text});

  final int number;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 12,
            backgroundColor: Theme.of(context).colorScheme.primary,
            child: Text('$number', style: const TextStyle(color: Colors.white, fontSize: 12)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

/// Binance Pay top-up: unlike the Libyana flow there's nothing to poll for — the customer
/// submits an Order ID and the server verifies + credits synchronously in one call.
class _BinanceTopupView extends StatefulWidget {
  const _BinanceTopupView();

  @override
  State<_BinanceTopupView> createState() => _BinanceTopupViewState();
}

class _BinanceTopupViewState extends State<_BinanceTopupView> {
  final _orderIdController = TextEditingController();
  bool _submitting = false;
  String? _error;
  BinanceTopupResult? _result;

  @override
  void dispose() {
    _orderIdController.dispose();
    super.dispose();
  }

  Future<void> _copyPayId(String payId) async {
    await Clipboard.setData(ClipboardData(text: payId));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم نسخ المعرّف')));
  }

  Future<void> _verify() async {
    final orderId = _orderIdController.text.trim();
    if (orderId.isEmpty) {
      setState(() => _error = 'أدخل Order ID');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final service = BinanceTopupService(context.read<AuthStore>().api);
      final result = await service.verify(orderId);
      if (!mounted) return;
      setState(() {
        _result = result;
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

  void _reset() {
    _orderIdController.clear();
    setState(() {
      _result = null;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_result != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          const Icon(Icons.check_circle_rounded, size: 64, color: Colors.green),
          const SizedBox(height: 16),
          Text(
            'تم شحن ${_result!.amountLyd.toStringAsFixed(2)} د.ل',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            'مقابل ${_result!.amountUsdt} ${_result!.currency}',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600),
          ),
          const SizedBox(height: 24),
          OutlinedButton(onPressed: _reset, child: const Text('شحن مبلغ آخر')),
        ],
      );
    }

    final payId = context.watch<AppConfigStore>().config.binancePayId ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('حوّل USDT إلى هذا المعرّف (Pay ID)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          payId,
                          textDirection: TextDirection.ltr,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: () => _copyPayId(payId),
                      icon: const Icon(Icons.copy_rounded),
                      tooltip: 'نسخ المعرّف',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'نقبل USDT وUSDC وBUSD وFDUSD فقط.',
          style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _orderIdController,
          textDirection: TextDirection.ltr,
          decoration: const InputDecoration(labelText: 'Order ID', hintText: 'انسخه من تطبيق Binance بعد التحويل'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _submitting ? null : _verify,
          icon: _submitting
              ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.check_rounded),
          label: Text(_submitting ? 'جارٍ التحقق…' : 'تحقق واشحن الرصيد'),
        ),
        const SizedBox(height: 8),
        Text(
          'كل Order ID يُستخدم مرة وحدة بس — لا تستخدم نفس الرقم لعمليتين.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade600)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
