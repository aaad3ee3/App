import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/referral_info.dart';
import '../services/api_client.dart';
import '../services/auth_store.dart';
import '../services/referral_service.dart';
import '../theme/app_theme.dart';

class ReferralScreen extends StatefulWidget {
  const ReferralScreen({super.key});

  @override
  State<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends State<ReferralScreen> {
  late final ReferralService _referralService;
  ReferralInfo? _info;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _referralService = ReferralService(context.read<AuthStore>().api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final info = await _referralService.getMyReferralInfo();
      if (!mounted) return;
      setState(() {
        _info = info;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _copyCode() async {
    if (_info == null) return;
    await Clipboard.setData(ClipboardData(text: _info!.code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم نسخ الكود')));
  }

  Future<void> _shareViaWhatsapp() async {
    if (_info == null) return;
    final url = Uri.https('wa.me', '/', {'text': _info!.shareText});
    final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تعذّر فتح واتساب')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ادعُ صديق')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      OutlinedButton(onPressed: _load, child: const Text('إعادة المحاولة')),
                    ],
                  ),
                )
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final info = _info!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.navy, AppColors.navyDark],
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
            ),
            borderRadius: BorderRadius.circular(AppTheme.radiusLg),
            boxShadow: AppTheme.cardShadow,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.card_giftcard_rounded, color: AppColors.goldLight, size: 28),
              const SizedBox(height: 12),
              Text(
                'اكسب ${info.bonusAmount} د.ل مقابل كل صديق',
                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                'شارك كودك — لما صديقك يسجل ويكمل أول عملية شراء، تاخذوا رصيد مجاني الاثنين.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13, height: 1.6),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text('كودك', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        InkWell(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          onTap: _copyCode,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              border: Border.all(color: Theme.of(context).colorScheme.outline),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    info.code,
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 2),
                  ),
                ),
                const Icon(Icons.copy_rounded, size: 20),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _shareViaWhatsapp,
          style: FilledButton.styleFrom(backgroundColor: AppColors.success),
          icon: const Icon(Icons.share_rounded),
          label: const Text('مشاركة عبر واتساب'),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: _StatCard(label: 'أصدقاء انضموا', value: '${info.referredCount}'),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(label: 'رصيد مكتسب', value: '${info.totalEarned} LYD'),
            ),
          ],
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
