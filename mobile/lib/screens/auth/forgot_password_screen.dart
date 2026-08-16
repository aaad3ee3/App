import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../services/auth_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/phone_field.dart';

/// Password recovery: send a code to the phone, then set a new password.
///
/// The server answers identically whether or not the number is registered, so this
/// screen advances to the code step either way — anything else would turn the app into
/// a way to test which numbers have accounts.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

enum _Step { phone, reset, done }

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _phoneFormKey = GlobalKey<FormState>();
  final _resetFormKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();

  _Step _step = _Step.phone;
  bool _submitting = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    if (!_phoneFormKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    final auth = context.read<AuthStore>();
    final ok = await auth.requestPasswordResetCode(_phoneController.text.trim());

    if (!mounted) return;
    setState(() {
      _submitting = false;
      if (ok) {
        _step = _Step.reset;
      } else {
        _error = auth.lastError ?? 'تعذّر إرسال الرمز';
      }
    });
  }

  Future<void> _reset() async {
    if (!_resetFormKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    final auth = context.read<AuthStore>();
    final ok = await auth.completePasswordReset(
      phone: _phoneController.text.trim(),
      code: _codeController.text.trim(),
      password: _passwordController.text,
    );

    if (!mounted) return;
    setState(() {
      _submitting = false;
      if (ok) {
        _step = _Step.done;
      } else {
        _error = auth.lastError ?? 'الرمز غير صحيح';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('استعادة كلمة المرور')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: switch (_step) {
                _Step.phone => _buildPhoneStep(),
                _Step.reset => _buildResetStep(),
                _Step.done => _buildDoneStep(),
              },
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
          const Icon(Icons.lock_reset_rounded, size: 56, color: AppColors.gold),
          const SizedBox(height: 20),
          Text(
            'أدخل رقم هاتفك',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'راح نبعتلك رمزاً لتعيين كلمة مرور جديدة',
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

  Widget _buildResetStep() {
    return Form(
      key: _resetFormKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'كلمة مرور جديدة',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'إذا كان الرقم مسجّلاً لدينا، وصلك رمز الآن',
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 14),
          ),
          const SizedBox(height: 24),
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
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _passwordController,
            enabled: !_submitting,
            obscureText: _obscure,
            decoration: InputDecoration(
              labelText: 'كلمة المرور الجديدة',
              helperText: '12 حرفاً على الأقل',
              prefixIcon: const Icon(Icons.lock_outline_rounded),
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: (v) => (v == null || v.length < 12) ? 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل' : null,
            onFieldSubmitted: (_) => _reset(),
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
            onPressed: _submitting ? null : _reset,
            child: _submitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('تعيين كلمة المرور'),
          ),
          TextButton(
            onPressed: _submitting ? null : _sendCode,
            child: const Text('لم يصلك الرمز؟ أعد الإرسال'),
          ),
        ],
      ),
    );
  }

  Widget _buildDoneStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.check_circle_rounded, size: 64, color: AppColors.success),
        const SizedBox(height: 20),
        Text(
          'تم تغيير كلمة المرور',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          'سجّلنا خروجك من كل الأجهزة للأمان. سجّل الدخول بكلمة المرور الجديدة.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 14),
        ),
        const SizedBox(height: 28),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('العودة لتسجيل الدخول'),
        ),
      ],
    );
  }
}
