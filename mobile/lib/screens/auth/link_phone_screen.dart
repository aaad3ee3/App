import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../services/auth_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/phone_field.dart';

/// Links a Libyana number to the signed-in account: request a code, then verify it.
///
/// Once verified the number stays on the account permanently — this screen only ever
/// runs again if the customer wants to change it. Pops with `true` on success so the
/// caller (the top-up screen, most often) can continue right where it left off.
class LinkPhoneScreen extends StatefulWidget {
  const LinkPhoneScreen({super.key});

  @override
  State<LinkPhoneScreen> createState() => _LinkPhoneScreenState();
}

enum _Step { phone, verify }

class _LinkPhoneScreenState extends State<LinkPhoneScreen> {
  final _phoneFormKey = GlobalKey<FormState>();
  final _verifyFormKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();

  _Step _step = _Step.phone;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    if (!_phoneFormKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    final auth = context.read<AuthStore>();
    final ok = await auth.requestLinkPhone(_phoneController.text.trim());

    if (!mounted) return;
    setState(() {
      _submitting = false;
      if (ok) {
        _step = _Step.verify;
      } else {
        _error = auth.lastError ?? 'تعذّر إرسال الرمز';
      }
    });
  }

  Future<void> _verify() async {
    if (!_verifyFormKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    final auth = context.read<AuthStore>();
    final ok = await auth.verifyLinkPhone(
      phone: _phoneController.text.trim(),
      code: _codeController.text.trim(),
    );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = auth.lastError ?? 'الرمز غير صحيح');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ربط رقم الهاتف')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _step == _Step.phone ? _buildPhoneStep() : _buildVerifyStep(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPhoneStep() {
    return Form(
      key: _phoneFormKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.phone_iphone_rounded, size: 56, color: AppColors.gold),
          const SizedBox(height: 20),
          Text(
            'اربط رقم ليبيانا',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'هذا الرقم هو اللي راح تحوّل منه عند الشحن، ونبعتلك رمز تأكيد للتأكد إنه رقمك فعلاً. تحتاج تسويها مرة وحدة بس.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 14),
          ),
          const SizedBox(height: 24),
          PhoneField(
            controller: _phoneController,
            enabled: !_submitting,
            autofocus: true,
            onSubmitted: _sendCode,
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.danger, fontSize: 14),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _submitting ? null : _sendCode,
            child: _submitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('أرسل الرمز'),
          ),
        ],
      ),
    );
  }

  Widget _buildVerifyStep() {
    return Form(
      key: _verifyFormKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'أدخل الرمز',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'أرسلنا رمزاً إلى '),
                TextSpan(
                  text: _phoneController.text.trim(),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 14),
          ),
          Center(
            child: TextButton(
              onPressed: _submitting
                  ? null
                  : () => setState(() {
                        _step = _Step.phone;
                        _error = null;
                        _codeController.clear();
                      }),
              child: const Text('تغيير الرقم'),
            ),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _codeController,
            enabled: !_submitting,
            autofocus: true,
            keyboardType: TextInputType.number,
            textDirection: TextDirection.ltr,
            textAlign: TextAlign.center,
            maxLength: 6,
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: 10),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(counterText: '', hintText: '······'),
            validator: (v) => (v == null || v.trim().length != 6) ? 'الرمز مكوّن من 6 أرقام' : null,
            onFieldSubmitted: (_) => _verify(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.danger, fontSize: 14),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _submitting ? null : _verify,
            child: _submitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('تأكيد الربط'),
          ),
          TextButton(
            onPressed: _submitting ? null : _sendCode,
            child: const Text('لم يصلك الرمز؟ أعد الإرسال'),
          ),
        ],
      ),
    );
  }
}
