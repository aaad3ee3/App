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

  /// Libyana's prefixes (092/094) only. Al-Madar (091/093) cannot fund a wallet through the Libyana transfer
  /// flow, nor receive our verification codes, so the server rejects it too — catching it
  /// here just saves a round trip and gives a clearer reason.
  static String? validate(String? value) {
    final digits = (value ?? '').replaceAll(RegExp(r'[^\d]'), '');
    if (digits.isEmpty) return 'أدخل رقم هاتفك';

    // Mirrors normalizeLibyanPhone in backend/src/lib/phone.ts. Order matters: '00218'
    // has to be tested before the bare leading '0', or an international-format number
    // falls through and gets rejected here even though the server would accept it.
    String national;
    if (digits.startsWith('00218')) {
      national = digits.substring(5);
    } else if (digits.startsWith('218') && digits.length > 9) {
      national = digits.substring(3);
    } else if (digits.startsWith('0')) {
      national = digits.substring(1);
    } else {
      national = digits;
    }

    if (national.length != 9 || !national.startsWith('9')) {
      return 'الرقم يجب أن يكون 10 أرقام';
    }

    final local = '0$national';
    if (!local.startsWith('092') && !local.startsWith('094')) {
      return 'ليبيانا فقط — الرقم يبدأ بـ 092 أو 094';
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
        hintText: '0921234567',
        hintTextDirection: TextDirection.ltr,
        prefixIcon: Icon(Icons.phone_android_rounded),
      ),
      validator: validate,
      onFieldSubmitted: (_) => onSubmitted?.call(),
    );
  }
}
