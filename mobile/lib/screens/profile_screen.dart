import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/app_config.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
import 'auth/delete_account_screen.dart';
import 'auth/link_phone_screen.dart';
import 'auth/login_screen.dart';
import 'store/orders_history_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  Future<void> _logout(BuildContext context) async {
    final auth = context.read<AuthStore>();
    await auth.logout();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

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
    final user = context.watch<AuthStore>().user;
    final config = context.watch<AppConfigStore>().config;
    final initial = (user?.fullName?.isNotEmpty == true ? user!.fullName![0] : 'م').toUpperCase();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  child: Text(
                    initial,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.fullName?.isNotEmpty == true ? user!.fullName! : 'مستخدم',
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        // Email is the identity — the address the customer signs in with.
                        user?.email ?? '',
                        textDirection: TextDirection.ltr,
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.receipt_long_outlined),
                title: const Text('طلباتي'),
                trailing: const Icon(Icons.chevron_left_rounded),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const OrdersHistoryScreen()),
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: Icon(
                  user?.phone != null ? Icons.phone_android_rounded : Icons.phone_disabled_rounded,
                  color: user?.phone != null ? AppColors.success : null,
                ),
                title: const Text('رقم الشحن'),
                subtitle: Text(
                  user?.phone ?? 'ما ربطت رقم بعد',
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(fontSize: 12.5),
                ),
                trailing: const Icon(Icons.chevron_left_rounded),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const LinkPhoneScreen()),
                ),
              ),
              if (config.whatsappUrl != null) ...[
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.support_agent_rounded, color: AppColors.success),
                  title: const Text('تواصل مع الدعم'),
                  subtitle: const Text('واتساب — نرد بأسرع وقت', style: TextStyle(fontSize: 12.5)),
                  trailing: const Icon(Icons.chevron_left_rounded),
                  onTap: () => _open(context, config.whatsappUrl),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: const Text('شروط الاستخدام'),
                trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                onTap: () => _open(context, config.termsUrl),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.privacy_tip_outlined),
                title: const Text('سياسة الخصوصية'),
                trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                onTap: () => _open(context, config.privacyUrl),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        OutlinedButton.icon(
          onPressed: () => _logout(context),
          style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('تسجيل الخروج'),
        ),
        const SizedBox(height: 8),

        // Deliberately last and understated — required to be reachable, but it should
        // not sit anywhere a customer might tap it by accident.
        TextButton(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const DeleteAccountScreen()),
          ),
          style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.onSurfaceVariant),
          child: const Text('حذف الحساب', style: TextStyle(fontSize: 13)),
        ),
      ],
    );
  }
}
