import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'api_client.dart';

/// Public settings fetched from the backend: the support contact, the policy URLs, how
/// long deliveries normally take, and the force-update gate.
///
/// Served rather than hard-coded so the support number can change without pushing a new
/// build through store review — the number is exactly the thing most likely to change,
/// and the slowest to fix if it is baked into the binary.
class AppConfig {
  const AppConfig({
    this.supportWhatsapp,
    this.privacyUrl,
    this.termsUrl,
    this.faqUrl,
    this.giftcardMinutes = 5,
    this.smmHours = 24,
    this.minSupportedVersion = 0,
    this.latestVersionName,
    this.updateUrl,
  });

  final String? supportWhatsapp;
  final String? privacyUrl;
  final String? termsUrl;

  /// Null when the backend has no PUBLIC_BASE_URL set. The profile screen hides the row
  /// rather than showing a dead link — unlike the policy URLs, there is no public fallback
  /// to fall back to, and a broken help link is worse than no help link.
  final String? faqUrl;
  final int giftcardMinutes;
  final int smmHours;

  /// The oldest build number (the digits after `+` in pubspec.yaml) still allowed to
  /// run. 0 means the check is off — the server's own default, so a fresh deploy never
  /// locks everyone out by accident.
  final int minSupportedVersion;
  final String? latestVersionName;
  final String? updateUrl;

  /// Used before the fetch resolves, and if it fails. The policy links fall back to the
  /// public site so they are never dead — an app store review fails on a broken link.
  /// `minSupportedVersion` stays at its 0 default here deliberately: a customer with no
  /// network at all must never be blocked by a check that could not even run.
  static const fallback = AppConfig(
    privacyUrl: 'https://sayeh.ly/legal/privacy.html',
    termsUrl: 'https://sayeh.ly/legal/terms.html',
  );

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    final support = json['support'] as Map<String, dynamic>?;
    final legal = json['legal'] as Map<String, dynamic>?;
    final delivery = json['delivery'] as Map<String, dynamic>?;
    final app = json['app'] as Map<String, dynamic>?;

    return AppConfig(
      supportWhatsapp: support?['whatsapp'] as String?,
      privacyUrl: legal?['privacy_url'] as String? ?? fallback.privacyUrl,
      termsUrl: legal?['terms_url'] as String? ?? fallback.termsUrl,
      faqUrl: legal?['faq_url'] as String?,
      giftcardMinutes: (delivery?['giftcard_minutes'] as num?)?.toInt() ?? 5,
      smmHours: (delivery?['smm_hours'] as num?)?.toInt() ?? 24,
      minSupportedVersion: (app?['min_supported_version'] as num?)?.toInt() ?? 0,
      latestVersionName: app?['latest_version_name'] as String?,
      updateUrl: app?['update_url'] as String?,
    );
  }

  String? get whatsappUrl =>
      supportWhatsapp == null ? null : 'https://wa.me/$supportWhatsapp';
}

/// Loads the config once per app launch and hands out the cached copy afterwards. Also
/// reads the installed build number once, so [updateRequired] can compare the two
/// without every caller re-deriving it.
class AppConfigStore extends ChangeNotifier {
  AppConfigStore(this._api);

  final ApiClient _api;
  AppConfig _config = AppConfig.fallback;
  bool _loaded = false;
  int? _installedBuildNumber;

  AppConfig get config => _config;

  /// True once we know for certain the installed build is older than the server's
  /// floor. Stays false while the build number is still unknown or the check is off
  /// (minSupportedVersion == 0) — an unreachable server or a missing package info read
  /// must never be able to lock someone out by itself.
  bool get updateRequired =>
      _config.minSupportedVersion > 0 &&
      _installedBuildNumber != null &&
      _installedBuildNumber! < _config.minSupportedVersion;

  Future<void> load() async {
    if (_loaded) return;
    try {
      final info = await PackageInfo.fromPlatform();
      _installedBuildNumber = int.tryParse(info.buildNumber);
    } catch (e) {
      debugPrint('[config] could not read installed build number: $e');
    }
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
