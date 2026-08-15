import 'package:flutter/material.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:provider/provider.dart';
import '../../config/store_config.dart';
import '../../models/topup_request.dart';
import '../../services/api_client.dart';
import '../../services/auth_store.dart';
import '../../services/topup_service.dart';

class TopupScreen extends StatefulWidget {
  const TopupScreen({super.key});

  @override
  State<TopupScreen> createState() => _TopupScreenState();
}

class _TopupScreenState extends State<TopupScreen> {
  late final TopupService _topupService;
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _amountController = TextEditingController();

  TopupRequest? _pending;
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _topupService = TopupService(context.read<AuthStore>().api);
    _load();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _amountController.dispose();
    super.dispose();
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
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final topup = await _topupService.create(
        senderPhone: _phoneController.text.trim(),
        amount: double.parse(_amountController.text.trim()),
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
    return Scaffold(
      appBar: AppBar(title: const Text('شحن الرصيد')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: _pending != null ? _PendingView(topup: _pending!, submitting: _submitting, onCancel: _cancel) : _buildForm(),
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
          const Text(
            'أدخل رقم ليبيانا اللي راح تحول منه والمبلغ، وراح نعطيك تعليمات التحويل.',
            style: TextStyle(fontSize: 14),
          ),
          const SizedBox(height: 24),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(labelText: 'رقم ليبيانا (مثال: 0912345678)'),
            validator: (v) => (v == null || v.trim().length < 9) ? 'أدخل رقم هاتف صحيح' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(labelText: 'المبلغ (دينار ليبي)'),
            validator: (v) {
              final n = double.tryParse((v ?? '').trim());
              if (n == null || n <= 0) return 'أدخل مبلغًا صحيحًا';
              return null;
            },
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('إنشاء طلب الشحن'),
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
                  text: 'حوّل مبلغ ${topup.requestedAmount} دينار إلى الرقم:\n${StoreConfig.libyanaTopupPhoneNumber}',
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
