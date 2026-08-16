import 'package:flutter/foundation.dart';
import 'api_client.dart';

/// Public settings fetched from the backend: the support contact, the policy URLs, and
/// how long deliveries normally take.
///
/// Served rather than hard-coded so the support number can change without pushing a new
/// build through store review — the number is exactly the thing most likely to change,
/// and the slowest to fix if it is baked into the binary.
class AppConfig {
  const AppConfig({
    this.supportWhatsapp,
    this.privacyUrl,
    this.termsUrl,
    this.giftcardMinutes = 5,
    this.smmHours = 24,
  });

  final String? supportWhatsapp;
  final String? privacyUrl;
  final String? termsUrl;
  final int giftcardMinutes;
  final int smmHours;

  /// Used before the fetch resolves, and if it fails. The policy links fall back to the
  /// public site so they are never dead — an app store review fails on a broken link.
  static const fallback = AppConfig(
    privacyUrl: 'https://sayeh.ly/legal/privacy.html',
    termsUrl: 'https://sayeh.ly/legal/terms.html',
  );

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    final support = json['support'] as Map<String, dynamic>?;
    final legal = json['legal'] as Map<String, dynamic>?;
    final delivery = json['delivery'] as Map<String, dynamic>?;

    return AppConfig(
      supportWhatsapp: support?['whatsapp'] as String?,
      privacyUrl: legal?['privacy_url'] as String? ?? fallback.privacyUrl,
      termsUrl: legal?['terms_url'] as String? ?? fallback.termsUrl,
      giftcardMinutes: (delivery?['giftcard_minutes'] as num?)?.toInt() ?? 5,
      smmHours: (delivery?['smm_hours'] as num?)?.toInt() ?? 24,
    );
  }

  String? get whatsappUrl =>
      supportWhatsapp == null ? null : 'https://wa.me/$supportWhatsapp';
}

/// Loads the config once per app launch and hands out the cached copy afterwards.
class AppConfigStore extends ChangeNotifier {
  AppConfigStore(this._api);

  final ApiClient _api;
  AppConfig _config = AppConfig.fallback;
  bool _loaded = false;

  AppConfig get config => _config;

  Future<void> load() async {
    if (_loaded) return;
    try {
      final json = await _api.get('/config');
      _config = AppConfig.fromJson(json);
    } catch (e) {
      // Non-fatal by design: the app is fully usable with the fallback, and failing to
      // start over a missing support number would be far worse than the missing number.
      debugPrint('[config] falling back to defaults: $e');
      _config = AppConfig.fallback;
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }
}
