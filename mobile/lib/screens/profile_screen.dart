import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/app_config.dart';
import '../services/auth_store.dart';
import '../services/settings_store.dart';
import '../theme/app_theme.dart';
import '../widgets/glow_blob.dart';
import 'auth/delete_account_screen.dart';
import 'auth/link_phone_screen.dart';
import 'auth/login_screen.dart';
import 'referral_screen.dart';
import 'store/favorites_screen.dart';

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
    final settings = context.watch<SettingsStore>();
    final initial = (user?.fullName?.isNotEmpty == true ? user!.fullName![0] : 'م').toUpperCase();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Same treatment as the wallet balance card — a navy gradient with a soft gold
        // glow in the corner — so the two "hero" cards a customer sees most feel like
        // the same app instead of one being styled and the other a plain default Card.
        ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.navy, AppColors.navyDark],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
            ),
            child: Stack(
              children: [
                const Positioned(top: -30, left: -20, child: GlowBlob(size: 110, alpha: 0.12)),
                Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: AppColors.gold,
                      child: Text(
                        initial,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.fullName?.isNotEmpty == true ? user!.fullName! : 'مستخدم',
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: Colors.white),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            // Email is the identity — the address the customer signs in with.
                            user?.email ?? '',
                            textDirection: TextDirection.ltr,
                            style: TextStyle(color: AppColors.cream.withValues(alpha: 0.82)),
                          ),
                        ],
                      ),
                    ),
                  ],
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
                leading: const Icon(Icons.favorite_border_rounded, color: AppColors.danger),
                title: const Text('المفضلة'),
                subtitle: const Text('المنتجات الي حفظتها', style: TextStyle(fontSize: 12.5)),
                trailing: const Icon(Icons.chevron_left_rounded),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const FavoritesScreen()),
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.card_giftcard_rounded, color: AppColors.gold),
                title: const Text('ادعُ صديق'),
                subtitle: const Text('شارك كودك واكسبوا رصيد مجاني', style: TextStyle(fontSize: 12.5)),
                trailing: const Icon(Icons.chevron_left_rounded),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ReferralScreen()),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        Card(
          child: Column(
            children: [
              // "طلباتي" used to live here; it is a bottom-tab of its own now, so keeping
              // a duplicate row would just add a second path to the same screen.
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
              // Above the support row on purpose: most questions that reach WhatsApp are
              // already answered here ("where is my code", "why did my top-up not land"),
              // so the self-serve answer should be the one a customer meets first.
              if (config.faqUrl != null) ...[
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.help_outline_rounded),
                  title: const Text('الأسئلة الشائعة'),
                  subtitle: const Text('إجابات سريعة لأكثر الأسئلة', style: TextStyle(fontSize: 12.5)),
                  trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                  onTap: () => _open(context, config.faqUrl),
                ),
              ],
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
          child: SwitchListTile(
            secondary: Icon(settings.isDark ? Icons.dark_mode_rounded : Icons.light_mode_rounded),
            title: const Text('الوضع الليلي'),
            subtitle: Text(
              settings.isDark ? 'مفعّل' : 'مطفي',
              style: const TextStyle(fontSize: 12.5),
            ),
            value: settings.isDark,
            // Writes an explicit light/dark choice rather than ever returning to
            // ThemeMode.system: once someone has touched this switch, following the phone
            // setting behind their back would just look like the app changing on its own.
            onChanged: (on) =>
                context.read<SettingsStore>().setThemeMode(on ? ThemeMode.dark : ThemeMode.light),
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
