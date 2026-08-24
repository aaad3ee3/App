import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/app_config.dart';
import '../theme/app_theme.dart';
import '../widgets/sayeh_logo.dart';

/// Full-screen, non-dismissable gate shown when the installed build is older than the
/// server's floor (see AppConfigStore.updateRequired).
///
/// There is deliberately no way past this screen — no back button, no "later" — because
/// the whole point is retiring an old sideloaded build without having to message every
/// customer individually. `PopScope` swallows the system back gesture for the same
/// reason: a customer stuck here should have exactly one way forward, downloading the
/// update.
class UpdateRequiredScreen extends StatelessWidget {
  const UpdateRequiredScreen({super.key});

  Future<void> _openUpdate(BuildContext context, String url) async {
    final messenger = ScaffoldMessenger.of(context);
    final opened = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!opened) {
      messenger.showSnackBar(const SnackBar(content: Text('تعذّر فتح رابط التحديث')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<AppConfigStore>().config;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: isDark
                  ? [AppColors.darkBackground, AppColors.navyDark]
                  : [AppColors.creamLight, AppColors.cream],
            ),
          ),
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(28),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SayehLogo(size: 72),
                      const SizedBox(height: 28),
                      const Icon(Icons.system_update_rounded, size: 48, color: AppColors.gold),
                      const SizedBox(height: 20),
                      Text(
                        'في تحديث جديد',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        config.latestVersionName != null
                            ? 'النسخة اللي عندك قديمة، ولازم تحدّث للنسخة ${config.latestVersionName} عشان تقدر تستمر تستخدم التطبيق.'
                            : 'النسخة اللي عندك قديمة، ولازم تحدّث عشان تقدر تستمر تستخدم التطبيق.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 15),
                      ),
                      const SizedBox(height: 32),
                      if (config.updateUrl != null)
                        FilledButton.icon(
                          onPressed: () => _openUpdate(context, config.updateUrl!),
                          icon: const Icon(Icons.download_rounded),
                          label: const Text('تحميل التحديث'),
                        )
                      else
                        Text(
                          'تواصل مع الدعم للحصول على النسخة الجديدة.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 14),
                        ),
                      if (config.whatsappUrl != null) ...[
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: () => _openUpdate(context, config.whatsappUrl!),
                          child: const Text('محتاج مساعدة؟ تواصل عبر واتساب'),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
