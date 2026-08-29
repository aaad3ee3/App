import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/app_config.dart';
import '../services/auth_store.dart';
import '../services/settings_store.dart';
import '../theme/app_theme.dart';
import '../widgets/glow_blob.dart';
import '../widgets/tap_scale.dart';
import 'auth/delete_account_screen.dart';
import 'auth/link_phone_screen.dart';
import 'auth/login_screen.dart';
import 'referral_screen.dart';
import 'store/favorites_screen.dart';

/// WhatsApp's real brand green — same principle as the catalog's Simple Icons badges:
/// a recognizable brand color is a fact about that channel, not a decorative choice.
const _whatsappGreen = Color(0xFF25D366);

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

    // Every section below fades and rises in on its own beat (60ms apart, within the
    // 150-350ms window motion research settles on) rather than the whole screen
    // appearing at once — the same staggered entrance the store's grids already use.
    Widget stagger(Widget child, int index) => child
        .animate(delay: (index * 60).ms)
        .fadeIn(duration: 260.ms, curve: Curves.easeOutCubic)
        .slideY(begin: 0.06, end: 0, duration: 260.ms, curve: Curves.easeOutCubic);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Same treatment as the wallet balance card — a navy gradient with a soft gold
        // glow in the corner — so the two "hero" cards a customer sees most feel like
        // the same app instead of one being styled and the other a plain default Card.
        stagger(
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
          0,
        ),
        const SizedBox(height: 16),

        // Quick actions: the two things a customer returns to on purpose (not settings
        // they set once and forget) get their own icon-forward tappable cards instead of
        // being buried as rows in a list — the same "quick action" pattern as an app-icon
        // shortcut, sized well past the 48x48 minimum touch target.
        stagger(
          Row(
            children: [
              Expanded(
                child: _QuickActionCard(
                  icon: Icons.favorite_rounded,
                  color: AppColors.danger,
                  label: 'المفضلة',
                  subtitle: 'منتجاتك المحفوظة',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const FavoritesScreen()),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _QuickActionCard(
                  icon: Icons.card_giftcard_rounded,
                  color: AppColors.gold,
                  label: 'ادعُ صديق',
                  subtitle: 'اربح رصيد مجاني',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ReferralScreen()),
                  ),
                ),
              ),
            ],
          ),
          1,
        ),
        const SizedBox(height: 20),

        _SectionLabel('حسابك'),
        const SizedBox(height: 8),
        stagger(
          Card(
            child: Column(
              children: [
                // "طلباتي" used to live here; it is a bottom-tab of its own now, so keeping
                // a duplicate row would just add a second path to the same screen.
                _SettingsRow(
                  icon: user?.phone != null ? Icons.phone_android_rounded : Icons.phone_disabled_rounded,
                  iconColor: user?.phone != null ? AppColors.success : AppColors.textMuted,
                  title: 'رقم الشحن',
                  subtitle: user?.phone ?? 'ما ربطت رقم بعد',
                  subtitleLtr: true,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const LinkPhoneScreen()),
                  ),
                ),
                const Divider(height: 1),
                _SettingsRow(
                  icon: settings.isDark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
                  iconColor: AppColors.gold,
                  title: 'الوضع الليلي',
                  subtitle: settings.isDark ? 'مفعّل' : 'مطفي',
                  trailing: Switch(
                    value: settings.isDark,
                    // Writes an explicit light/dark choice rather than ever returning to
                    // ThemeMode.system: once someone has touched this switch, following the
                    // phone setting behind their back would just look like the app changing
                    // on its own.
                    onChanged: (on) => context
                        .read<SettingsStore>()
                        .setThemeMode(on ? ThemeMode.dark : ThemeMode.light),
                  ),
                ),
              ],
            ),
          ),
          2,
        ),
        const SizedBox(height: 20),

        // Support hub: distinct branded channel cards rather than plain list rows — a
        // customer scanning for "how do I get help" recognizes a WhatsApp-green card
        // instantly, the way they would in any app that actually uses WhatsApp for support.
        if (config.faqUrl != null || config.whatsappUrl != null) ...[
          _SectionLabel('الدعم'),
          const SizedBox(height: 8),
          // Above the WhatsApp card on purpose: most questions that reach support are
          // already answered here ("where is my code", "why did my top-up not land"), so
          // the self-serve answer should be the one a customer meets first.
          if (config.faqUrl != null)
            stagger(
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _SupportChannelCard(
                  icon: Icons.help_outline_rounded,
                  color: AppColors.gold,
                  title: 'الأسئلة الشائعة',
                  subtitle: 'إجابات سريعة لأكثر الأسئلة',
                  onTap: () => _open(context, config.faqUrl),
                ),
              ),
              3,
            ),
          if (config.whatsappUrl != null)
            stagger(
              _SupportChannelCard(
                icon: Icons.chat_rounded,
                color: _whatsappGreen,
                title: 'تواصل عبر واتساب',
                subtitle: 'نرد بأسرع وقت',
                onTap: () => _open(context, config.whatsappUrl),
              ),
              4,
            ),
          const SizedBox(height: 20),
        ],

        stagger(
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
          5,
        ),
        const SizedBox(height: 16),

        stagger(
          OutlinedButton.icon(
            onPressed: () => _logout(context),
            style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('تسجيل الخروج'),
          ),
          6,
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

/// A small, muted section heading — Miller's-law chunking for a screen that would
/// otherwise read as one long undifferentiated list of rows.
class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

/// An icon-forward tappable card for the two profile actions a customer returns to
/// deliberately (favorites, referral) — icon on a soft colored disc, label and subtitle
/// below, physical press feedback via [TapScale].
class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    required this.icon,
    required this.color,
    required this.label,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TapScale(
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
            child: Column(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
                  child: Icon(icon, color: color, size: 22),
                ),
                const SizedBox(height: 10),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One row inside a settings [Card] — an icon on a soft colored disc (instead of a bare
/// icon) plus title/subtitle, with either a chevron (navigates) or a custom [trailing]
/// (e.g. a [Switch]) on the near edge.
class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    this.subtitleLtr = false,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final bool subtitleLtr;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.14), shape: BoxShape.circle),
        child: Icon(icon, color: iconColor, size: 19),
      ),
      title: Text(title),
      subtitle: Text(
        subtitle,
        textDirection: subtitleLtr ? TextDirection.ltr : null,
        style: const TextStyle(fontSize: 12.5),
      ),
      trailing: trailing ?? const Icon(Icons.chevron_left_rounded),
      onTap: onTap,
    );
  }
}

/// A full-width, brand-tinted support channel card (see [_whatsappGreen]) — a customer
/// scanning for help recognizes the channel by color before reading a single word of it.
class _SupportChannelCard extends StatelessWidget {
  const _SupportChannelCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TapScale(
      child: Card(
        color: color.withValues(alpha: 0.08),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          side: BorderSide(color: color.withValues(alpha: 0.35)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.18), shape: BoxShape.circle),
                  child: Icon(icon, color: color, size: 21),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_left_rounded, color: color),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
