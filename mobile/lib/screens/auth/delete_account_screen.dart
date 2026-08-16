import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/auth_store.dart';
import '../../theme/app_theme.dart';
import 'login_screen.dart';

/// Account deletion.
///
/// Spells out exactly what is lost before asking for the password, because deletion is
/// irreversible and the customer cannot undo a misunderstanding. The server refuses
/// while the wallet holds money or an order is unsettled; those refusals are shown here
/// verbatim, since they tell the customer precisely what to resolve first.
class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  final _passwordController = TextEditingController();
  bool _submitting = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _confirmAndDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تأكيد حذف الحساب'),
        content: const Text(
          'سيتم حذف حسابك وبياناتك نهائياً، ولا يمكن التراجع عن هذا.\n\nهل أنت متأكد؟',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('حذف نهائياً'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    final auth = context.read<AuthStore>();
    final error = await auth.deleteAccount(_passwordController.text);

    if (!mounted) return;

    if (error == null) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    } else {
      setState(() {
        _submitting = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: AppBar(title: const Text('حذف الحساب')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppColors.dangerBg,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.warning_amber_rounded, color: AppColors.danger),
                          SizedBox(width: 10),
                          Text(
                            'هذا الإجراء نهائي',
                            style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.danger),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'عند حذف حسابك:',
                        style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.danger.withValues(alpha: 0.9)),
                      ),
                      const SizedBox(height: 6),
                      ..._points.map(
                        (point) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('•  ', style: TextStyle(color: AppColors.danger)),
                              Expanded(
                                child: Text(
                                  point,
                                  style: TextStyle(fontSize: 13.5, color: AppColors.danger.withValues(alpha: 0.9)),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'لا يمكن حذف الحساب وفيه رصيد أو طلبات قيد التنفيذ — استخدم رصيدك أو انتظر اكتمال طلباتك أولاً.',
                  style: TextStyle(color: muted, fontSize: 13.5),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _passwordController,
                  enabled: !_submitting,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    labelText: 'أدخل كلمة المرور للتأكيد',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(
                      icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.dangerBg,
                      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: AppColors.danger, fontSize: 14),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting || _passwordController.text.isEmpty ? null : _confirmAndDelete,
                  style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('حذف حسابي'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _submitting ? null : () => Navigator.of(context).pop(),
                  child: const Text('إلغاء'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static const _points = [
    'يُحذف رقم هاتفك واسمك وبريدك نهائياً',
    'تُلغى كل جلساتك وتتوقف الإشعارات',
    'لن تستطيع الدخول للحساب مرة أخرى',
    'يبقى السجل المالي لمعاملاتك بدون اسمك، كما يقتضي القانون',
  ];
}
