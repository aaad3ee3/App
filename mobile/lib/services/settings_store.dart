import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Small per-device preferences: the theme the customer picked, and whether they have
/// already been through the intro screens.
///
/// Stored in [FlutterSecureStorage] rather than pulling in `shared_preferences` for two
/// short strings — the dependency is already here for the auth token, and on Android it
/// is backed by EncryptedSharedPreferences, which is a perfectly ordinary key/value store.
/// Neither value is secret; this is about not adding a package for 30 bytes.
///
/// Nothing here is synced to the server: these are device preferences, not account
/// settings, and a customer signing in on a second phone would not expect their theme to
/// follow them.
class SettingsStore extends ChangeNotifier {
  static const _themeKey = 'theme_mode';
  static const _onboardingKey = 'onboarding_seen';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  /// Dark by default — this is a gaming/top-up store, and every app a customer compares
  /// it against opens dark. [load] overrides it the moment a stored choice is found.
  ThemeMode _themeMode = ThemeMode.dark;
  bool _onboardingSeen = false;
  bool _loaded = false;

  ThemeMode get themeMode => _themeMode;
  bool get onboardingSeen => _onboardingSeen;
  bool get isDark => _themeMode == ThemeMode.dark;

  /// Read once at startup, before the first frame that depends on it. Failures are
  /// swallowed: a device whose keystore is unavailable should open on the defaults, not
  /// refuse to start.
  Future<void> load() async {
    if (_loaded) return;
    try {
      final stored = await _storage.read(key: _themeKey);
      if (stored == 'light') _themeMode = ThemeMode.light;
      if (stored == 'dark') _themeMode = ThemeMode.dark;
      if (stored == 'system') _themeMode = ThemeMode.system;
      _onboardingSeen = (await _storage.read(key: _onboardingKey)) == 'true';
    } catch (e) {
      debugPrint('[settings] falling back to defaults: $e');
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (mode == _themeMode) return;
    _themeMode = mode;
    // Notify first so the UI flips immediately; persisting is not worth a frame of delay,
    // and a write that fails only costs the preference on next launch.
    notifyListeners();
    try {
      await _storage.write(key: _themeKey, value: mode.name);
    } catch (e) {
      debugPrint('[settings] could not persist theme: $e');
    }
  }

  Future<void> markOnboardingSeen() async {
    if (_onboardingSeen) return;
    _onboardingSeen = true;
    notifyListeners();
    try {
      await _storage.write(key: _onboardingKey, value: 'true');
    } catch (e) {
      // Worst case the intro shows once more on next launch — harmless, and far better
      // than blocking the customer from getting past it.
      debugPrint('[settings] could not persist onboarding flag: $e');
    }
  }
}
