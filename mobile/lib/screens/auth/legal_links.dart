import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/app_config.dart';

/// Terms and privacy links shown under the sign-up form.
///
/// Both stores require these to be reachable from inside the app, not only from the
/// listing — and a customer handing over a phone number and money is entitled to read
/// them before agreeing, not after.
class LegalLinks extends StatelessWidget {
  const LegalLinks({super.key});

  Future<void> _open(BuildContext context, String? url) async {
    if (url == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final opened = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!opened) {
      messenger.showSnackBar(const SnackBar(content: Text('تعذّر فتح الرابط')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<AppConfigStore>().config;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Column(
      children: [
        Text(
          'بإنشائك الحساب فأنت توافق على',
          textAlign: TextAlign.center,
          style: TextStyle(color: muted, fontSize: 12.5),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            TextButton(
              onPressed: () => _open(context, config.termsUrl),
              style: TextButton.styleFrom(minimumSize: Size.zero, padding: const EdgeInsets.symmetric(horizontal: 6)),
              child: const Text('شروط الاستخدام', style: TextStyle(fontSize: 12.5)),
            ),
            Text('و', style: TextStyle(color: muted, fontSize: 12.5)),
            TextButton(
              onPressed: () => _open(context, config.privacyUrl),
              style: TextButton.styleFrom(minimumSize: Size.zero, padding: const EdgeInsets.symmetric(horizontal: 6)),
              child: const Text('سياسة الخصوصية', style: TextStyle(fontSize: 12.5)),
            ),
          ],
        ),
      ],
    );
  }
}
