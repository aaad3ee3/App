import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Libyana phone input.
///
/// Shared by sign-in, sign-up and password reset so the validation message and the
/// accepted formats stay identical across all three — a number that works on one screen
/// and is rejected on another is the kind of inconsistency that makes an app feel broken.
class PhoneField extends StatelessWidget {
  const PhoneField({
    super.key,
    required this.controller,
    this.enabled = true,
    this.autofocus = false,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final bool enabled;
  final bool autofocus;
  final VoidCallback? onSubmitted;

  /// Libyana's prefixes only. Al-Madar cannot fund a wallet through the Libyana transfer
  /// flow, nor receive our verification codes, so the server rejects it too — catching it
  /// here just saves a round trip and gives a clearer reason.
  static String? validate(String? value) {
    final digits = (value ?? '').replaceAll(RegExp(r'[^\d]'), '');
    if (digits.isEmpty) return 'أدخل رقم هاتفك';

    final local = digits.startsWith('218')
        ? '0${digits.substring(3)}'
        : digits.startsWith('0')
            ? digits
            : '0$digits';

    if (local.length != 10) return 'الرقم يجب أن يكون 10 أرقام';
    if (!local.startsWith('091') && !local.startsWith('092')) {
      return 'ليبيانا فقط — الرقم يبدأ بـ 091 أو 092';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      enabled: enabled,
      autofocus: autofocus,
      keyboardType: TextInputType.phone,
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.left,
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[\d+ ]')),
        LengthLimitingTextInputFormatter(16),
      ],
      decoration: const InputDecoration(
        labelText: 'رقم الهاتف (ليبيانا)',
        hintText: '0912345678',
        hintTextDirection: TextDirection.ltr,
        prefixIcon: Icon(Icons.phone_android_rounded),
      ),
      validator: validate,
      onFieldSubmitted: (_) => onSubmitted?.call(),
    );
  }
}
